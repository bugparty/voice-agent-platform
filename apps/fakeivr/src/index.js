/**
 * Hard-mode 5-layer IVR (TwiML) router tree for Twilio Voice
 * Ported to Cloudflare Workers
 *
 * Behavior goals (intentionally unfriendly):
 * - L1–L3: NO agent option; pressing 0 will NOT transfer.
 * - Identity verification forced at L4.
 * - Only L5 (and only if identityVerified) can transfer to an agent.
 * - Wrong/timeout inputs cause repeats/backtracking.
 *
 * Quick start:
 *   1) pnpm install
 *   2) wrangler secret put TWILIO_AUTH_TOKEN    (for webhook validation)
 *      wrangler secret put AGENT_NUMBER         (where to transfer on L5 option 3)
 *      wrangler secret put MAX_CALL_DURATION_MINUTES  (optional, default: 10 minutes)
 *   3) wrangler dev
 *   4) In Twilio Console → Phone Numbers → Voice → A CALL COMES IN:
 *        Webhook: POST https://your-worker.workers.dev/voice
 */

import twilio from 'twilio';

// Session storage using KV (or in-memory fallback for development)
async function getSession(callSid, env) {
	if (!callSid) {
		console.warn('[IVR] getSession called without callSid');
		return null;
	}

	let s;
	if (env.SESSIONS) {
		// Use KV storage
		try {
			const stored = await env.SESSIONS.get(callSid, { type: 'json' });
			if (stored) {
				console.log('[IVR] Session retrieved from KV:', { callSid, level: stored.level });
				s = stored;
			} else {
				console.log('[IVR] No existing session found in KV, creating new:', { callSid });
			}
		} catch (error) {
			console.error('[IVR] Error retrieving session from KV:', error);
		}
	} else {
		console.warn('[IVR] KV SESSIONS binding not available, using in-memory (not persistent)');
	}

	if (!s) {
		s = {
			callSid,
			level: 1,
			identityMethod: null, // 'rx' | 'dob' | 'pin'
			identityCollected: false, // true once user chose a method at L4
			identityVerified: false, // becomes true once L5 reached
			retryCount: 0, // counts invalid entries (global-ish)
			l1Failures: 0, // counts invalid entries at L1 main menu
			l4Failures: 0,
			createdAt: Date.now(),
			lastSeenAt: Date.now(),
		};
		console.log('[IVR] New session created:', { callSid, level: s.level });
	}

	s.lastSeenAt = Date.now();
	return s;
}

async function saveSession(session, env) {
	if (!session) {
		console.warn('[IVR] saveSession called without session');
		return;
	}
	if (!env.SESSIONS) {
		console.warn('[IVR] KV SESSIONS binding not available, session not saved');
		return;
	}

	try {
		// Set TTL to 2 hours
		await env.SESSIONS.put(session.callSid, JSON.stringify(session), {
			expirationTtl: 2 * 60 * 60, // 2 hours in seconds
		});
		console.log('[IVR] Session saved to KV:', {
			callSid: session.callSid,
			level: session.level,
			identityVerified: session.identityVerified,
		});
	} catch (error) {
		console.error('[IVR] Error saving session to KV:', error);
	}
}

function twiml(build) {
	const vr = new twilio.twiml.VoiceResponse();
	build(vr);
	return new Response(vr.toString(), {
		headers: { 'Content-Type': 'text/xml' },
	});
}

function gatherMenu(vr, { action, prompt, numDigits = 1, timeout = 6 }) {
	const g = vr.gather({
		action,
		method: 'POST',
		input: 'dtmf',
		numDigits,
		timeout,
	});
	g.say({ voice: 'alice' }, prompt);
}

function sayInvalidAndRedirect(vr, redirectTo) {
	vr.say({ voice: 'alice' }, 'Sorry. That was not a valid selection.');
	vr.redirect({ method: 'POST' }, redirectTo);
}

// Check if call duration exceeds maximum allowed time
function checkCallDuration(session, maxDurationMinutes = 10) {
	if (!session || !session.createdAt) {
		return { exceeded: false };
	}
	const now = Date.now();
	const elapsed = now - session.createdAt;
	const maxDurationMs = maxDurationMinutes * 60 * 1000;
	return {
		exceeded: elapsed > maxDurationMs,
		elapsedMinutes: Math.floor(elapsed / 60000),
		maxDurationMinutes,
	};
}

// Return TwiML to hang up due to time limit
function twimlHangupDueToTimeLimit() {
	return twiml((vr) => {
		vr.say({ voice: 'alice' }, 'Thank you for calling. This call has reached the maximum time limit. Goodbye.');
		vr.hangup();
	});
}

function normalizeDigit(d) {
	if (typeof d !== 'string') return '';
	return d.trim();
}

// Helper to get form data from request (can only be called once)
async function getFormData(request) {
	const formData = await request.formData();
	const data = {};
	for (const [key, value] of formData.entries()) {
		data[key] = value;
	}
	return data;
}

// Twilio webhook validation
async function validateTwilioWebhook(request, formData, env) {
	const authToken = env.TWILIO_AUTH_TOKEN;
	if (!authToken) {
		console.log('[IVR] AUTH_TOKEN not set, skipping webhook validation');
		return true; // Skip validation if not set
	}

	try {
		const signature = request.headers.get('x-twilio-signature');
		if (!signature) {
			console.error('[IVR] Missing x-twilio-signature header');
			return false;
		}

		// Build URL: Use the full request URL (Twilio expects the exact URL it called)
		const requestUrl = new URL(request.url);
		// Twilio validates against the full URL including protocol and host, but without query string
		const url = `${requestUrl.protocol}//${requestUrl.host}${requestUrl.pathname}`;

		console.log('[IVR] Validating webhook:', {
			url,
			pathname: requestUrl.pathname,
			hasSignature: !!signature,
			paramCount: Object.keys(formData).length,
		});

		// Convert formData to params object (Twilio expects plain object)
		const params = {};
		for (const [key, value] of Object.entries(formData)) {
			params[key] = value;
		}

		const isValid = twilio.validateRequest(
			authToken,
			signature,
			url,
			params
		);

		console.log('[IVR] Webhook validation result:', { isValid, url });
		return isValid;
	} catch (e) {
		console.error('[IVR] Webhook validation error:', e);
		return false;
	}
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const path = url.pathname;
		const method = request.method;

		console.log(`[IVR] ${method} ${path}`, {
			url: request.url,
			headers: Object.fromEntries(request.headers.entries()),
		});

		// Get form data for POST requests (must be done before validation)
		let body = {};
		const rickRollUrl = env.RICK_ROLL_URL || 'https://www.myinstants.com/media/sounds/epic.mp3';
		if (method === 'POST') {
			try {
				body = await getFormData(request);
				console.log('[IVR] Form data received:', {
					keys: Object.keys(body),
					callSid: body.CallSid,
					from: body.From,
					to: body.To,
				});
			} catch (error) {
				console.error('[IVR] Error parsing form data:', error);
				return new Response('Error parsing form data', { status: 400 });
			}

			// Validate Twilio webhook for POST requests
			// Skip validation if DISABLE_WEBHOOK_VALIDATION is set (for debugging only)
			if (env.DISABLE_WEBHOOK_VALIDATION !== 'true') {
				const isValid = await validateTwilioWebhook(request, body, env);
				if (!isValid) {
					console.error('[IVR] Webhook validation failed', {
						path,
						hasAuthToken: !!env.TWILIO_AUTH_TOKEN,
						url: request.url,
					});
					return new Response('Twilio webhook signature validation failed', {
						status: 403,
					});
				}
				console.log('[IVR] Webhook validation passed');
			} else {
				console.warn('[IVR] Webhook validation DISABLED (for debugging only!)');
			}
		}

		const callSid = body.CallSid;
		// Always use the actual request URL origin (what Twilio actually calls)
		// This ensures redirects work correctly in production
		const baseUrl = new URL(request.url).origin;

		console.log('[IVR] Processing request:', {
			path,
			method,
			callSid,
			baseUrl,
			requestUrl: request.url,
		});

		// Check call duration for POST requests with a session
		// Skip for entry point to allow new calls
		if (method === 'POST' && callSid && path !== '/' && path !== '/voice') {
			const tempSession = await getSession(callSid, env);
			if (tempSession) {
				const maxDurationMinutes = env.MAX_CALL_DURATION_MINUTES
					? parseInt(env.MAX_CALL_DURATION_MINUTES, 10)
					: 10; // Default 10 minutes
				const durationCheck = checkCallDuration(tempSession, maxDurationMinutes);
				if (durationCheck.exceeded) {
					console.log('[IVR] Call duration exceeded:', {
						callSid,
						elapsedMinutes: durationCheck.elapsedMinutes,
						maxDurationMinutes: durationCheck.maxDurationMinutes,
					});
					return twimlHangupDueToTimeLimit();
				}
			}
		}

		// Debug endpoint: GET /debug/session/:callSid
		if (path.startsWith('/debug/session/') && method === 'GET') {
			const callSidFromPath = path.split('/').pop();
			if (callSidFromPath && env.SESSIONS) {
				const s = await env.SESSIONS.get(callSidFromPath, { type: 'json' });
				if (!s) {
					return Response.json({ ok: false, error: 'not found' }, { status: 404 });
				}
				return Response.json({ ok: true, session: s });
			}
		}

		// Route handlers
		// Handle root path and /voice as entry points
		if ((path === '/' || path === '/voice') && method === 'POST') {
			console.log('[IVR] Handling entry point:', { path, callSid });

			if (!callSid) {
				console.error('[IVR] Missing CallSid in request body');
				return new Response('Missing CallSid', { status: 400 });
			}

			try {
				const s = await getSession(callSid, env);
				if (!s) {
					console.error('[IVR] Failed to get/create session');
					return new Response('Failed to create session', { status: 500 });
				}

				console.log('[IVR] Session created/retrieved:', {
					callSid: s.callSid,
					level: s.level,
				});

				// Always start at L1 for a new call
				s.level = 1;
				s.identityMethod = null;
				s.identityCollected = false;
				s.identityVerified = false;
				s.retryCount = 0;
				s.l1Failures = 0;
				s.l4Failures = 0;

				await saveSession(s, env);
				console.log('[IVR] Session saved');

				const redirectUrl = `${baseUrl}/ivr/l1`;
				console.log('[IVR] Returning TwiML with redirect to:', redirectUrl);

				// Welcome message (configurable via env var)
				const welcomeMessage = env.WELCOME_MESSAGE || 'Welcome to Side Effect Emporium.While you’re here, may we interest you in our long-term storage solutions?You’ll still be able to see the grass.';

				return twiml((vr) => {
					//vr.play(rickRollUrl)
					vr.say({ voice: 'alice' }, welcomeMessage);
					vr.redirect({ method: 'POST' }, redirectUrl);
				});
			} catch (error) {
				console.error('[IVR] Error in entry point handler:', error);
				return new Response(`Internal error: ${error.message}`, { status: 500 });
			}
		}

		// L1: Main menu
		if (path === '/ivr/l1' && method === 'POST') {
			const s = await getSession(callSid, env);
			if (!s) return new Response('Missing CallSid', { status: 400 });
			s.level = 1;
			await saveSession(s, env);

			return twiml((vr) => {
				gatherMenu(vr, {
					action: `${baseUrl}/ivr/l1/handle`,
					prompt:
						'Main menu. Press 1 for Pharmacy Services. Press 2 for Store Information. Press 3 for Other Inquiries.',
				});
				vr.say({ voice: 'alice' }, 'No input received.');
				vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l1`);
			});
		}

		if (path === '/ivr/l1/handle' && method === 'POST') {
			const s = await getSession(callSid, env);
			const d = normalizeDigit(body.Digits);
			if (!s) return new Response('Missing CallSid', { status: 400 });

			if (d !== '1' && d !== '2' && d !== '3') {
				s.retryCount++;
				s.l1Failures++;
				await saveSession(s, env);

				// Hang up after 3 invalid attempts at L1 to save costs
				if (s.l1Failures >= 3) {
					console.log('[IVR] L1 max retries exceeded, hanging up:', { callSid, l1Failures: s.l1Failures });
					return twiml((vr) => {
						vr.say({ voice: 'alice' }, 'We were unable to understand your selection. Please try again later. Goodbye.');
						vr.hangup();
					});
				}
			}

			return twiml((vr) => {
				if (d === '1') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l2/pharmacy`);
				} else if (d === '2') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l2/store`);
				} else if (d === '3') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l2/other`);
				} else {
					sayInvalidAndRedirect(vr, `${baseUrl}/ivr/l1`);
				}
			});
		}

		// L2: Category menus
		if (path === '/ivr/l2/pharmacy' && method === 'POST') {
			const s = await getSession(callSid, env);
			if (!s) return new Response('Missing CallSid', { status: 400 });
			s.level = 2;
			await saveSession(s, env);

			return twiml((vr) => {
				gatherMenu(vr, {
					action: `${baseUrl}/ivr/l2/pharmacy/handle`,
					prompt:
						'Pharmacy Services. Press 1 for Prescription Pickup. Press 2 for Prescription Status. Press 3 for Insurance and Billing. Press 9 to return to the previous menu.',
				});
				vr.say({ voice: 'alice' }, 'No input received.');
				vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l2/pharmacy`);
			});
		}

		if (path === '/ivr/l2/pharmacy/handle' && method === 'POST') {
			const s = await getSession(callSid, env);
			const d = normalizeDigit(body.Digits);
			if (!s) return new Response('Missing CallSid', { status: 400 });

			if (d !== '1' && d !== '2' && d !== '3' && d !== '9') {
				s.retryCount++;
				await saveSession(s, env);
			}

			return twiml((vr) => {
				if (d === '1') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/pickup`);
				} else if (d === '2') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/status`);
				} else if (d === '3') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/billing`);
				} else if (d === '9') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l1`);
				} else if (d === '0') {
					vr.say({ voice: 'alice' }, 'Please listen carefully to the options.');
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l2/pharmacy`);
				} else {
					sayInvalidAndRedirect(vr, `${baseUrl}/ivr/l2/pharmacy`);
				}
			});
		}

		if (path === '/ivr/l2/store' && method === 'POST') {
			const s = await getSession(callSid, env);
			if (!s) return new Response('Missing CallSid', { status: 400 });
			s.level = 2;
			await saveSession(s, env);

			return twiml((vr) => {
				gatherMenu(vr, {
					action: `${baseUrl}/ivr/l2/store/handle`,
					prompt:
						'Store Information. Press 1 for store hours. Press 2 for location. Press 3 for promotions. Press 9 to return to the previous menu.',
				});
				vr.say({ voice: 'alice' }, 'No input received.');
				vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l2/store`);
			});
		}

		if (path === '/ivr/l2/store/handle' && method === 'POST') {
			const s = await getSession(callSid, env);
			const d = normalizeDigit(body.Digits);
			if (!s) return new Response('Missing CallSid', { status: 400 });

			if (d !== '1' && d !== '2' && d !== '3' && d !== '9') {
				s.retryCount++;
				await saveSession(s, env);
			}

			return twiml((vr) => {
				if (d === '1' || d === '2' || d === '3') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/store-detail`);
				} else if (d === '9') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l1`);
				} else if (d === '0') {
					vr.say({ voice: 'alice' }, 'Please listen carefully to the options.');
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l2/store`);
				} else {
					sayInvalidAndRedirect(vr, `${baseUrl}/ivr/l2/store`);
				}
			});
		}

		if (path === '/ivr/l2/other' && method === 'POST') {
			const s = await getSession(callSid, env);
			if (!s) return new Response('Missing CallSid', { status: 400 });
			s.level = 2;
			await saveSession(s, env);

			return twiml((vr) => {
				gatherMenu(vr, {
					action: `${baseUrl}/ivr/l2/other/handle`,
					prompt:
						'Other Inquiries. Press 1 for account questions. Press 2 for complaints. Press 3 for feedback. Press 9 to return to the previous menu.',
				});
				vr.say({ voice: 'alice' }, 'No input received.');
				vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l2/other`);
			});
		}

		if (path === '/ivr/l2/other/handle' && method === 'POST') {
			const s = await getSession(callSid, env);
			const d = normalizeDigit(body.Digits);
			if (!s) return new Response('Missing CallSid', { status: 400 });

			if (d !== '1' && d !== '2' && d !== '3' && d !== '9') {
				s.retryCount++;
				await saveSession(s, env);
			}

			return twiml((vr) => {
				if (d === '1' || d === '2' || d === '3') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/other-detail`);
				} else if (d === '9') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l1`);
				} else if (d === '0') {
					vr.say({ voice: 'alice' }, 'Please listen carefully to the options.');
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l2/other`);
				} else {
					sayInvalidAndRedirect(vr, `${baseUrl}/ivr/l2/other`);
				}
			});
		}

		// L3: Specific tasks
		if (path === '/ivr/l3/status' && method === 'POST') {
			const s = await getSession(callSid, env);
			if (!s) return new Response('Missing CallSid', { status: 400 });
			s.level = 3;
			await saveSession(s, env);

			return twiml((vr) => {
				gatherMenu(vr, {
					action: `${baseUrl}/ivr/l3/status/handle`,
					prompt:
						'Prescription Status. Press 1 for automated refill status. Press 2 for notification settings. Press 3 if your prescription is delayed.',
				});
				vr.say({ voice: 'alice' }, 'No input received.');
				vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/status`);
			});
		}

		if (path === '/ivr/l3/status/handle' && method === 'POST') {
			const s = await getSession(callSid, env);
			const d = normalizeDigit(body.Digits);
			if (!s) return new Response('Missing CallSid', { status: 400 });

			if (d !== '1' && d !== '2' && d !== '3') {
				s.retryCount++;
				await saveSession(s, env);
			}

			return twiml((vr) => {
				if (d === '1' || d === '2' || d === '3') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l4/identity`);
				} else if (d === '0') {
					vr.say({ voice: 'alice' }, 'Please listen carefully to the options.');
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/status`);
				} else {
					sayInvalidAndRedirect(vr, `${baseUrl}/ivr/l3/status`);
				}
			});
		}

		if (path === '/ivr/l3/pickup' && method === 'POST') {
			const s = await getSession(callSid, env);
			if (!s) return new Response('Missing CallSid', { status: 400 });
			s.level = 3;
			await saveSession(s, env);

			return twiml((vr) => {
				gatherMenu(vr, {
					action: `${baseUrl}/ivr/l3/pickup/handle`,
					prompt:
						'Prescription Pickup. Press 1 for pickup window. Press 2 for pickup requirements. Press 3 for exceptions and delays.',
				});
				vr.say({ voice: 'alice' }, 'No input received.');
				vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/pickup`);
			});
		}

		if (path === '/ivr/l3/pickup/handle' && method === 'POST') {
			const s = await getSession(callSid, env);
			const d = normalizeDigit(body.Digits);
			if (!s) return new Response('Missing CallSid', { status: 400 });

			if (d !== '1' && d !== '2' && d !== '3') {
				s.retryCount++;
				await saveSession(s, env);
			}

			return twiml((vr) => {
				if (d === '1' || d === '2' || d === '3') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l4/identity`);
				} else if (d === '0') {
					vr.say({ voice: 'alice' }, 'Please listen carefully to the options.');
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/pickup`);
				} else {
					sayInvalidAndRedirect(vr, `${baseUrl}/ivr/l3/pickup`);
				}
			});
		}

		if (path === '/ivr/l3/billing' && method === 'POST') {
			const s = await getSession(callSid, env);
			if (!s) return new Response('Missing CallSid', { status: 400 });
			s.level = 3;
			await saveSession(s, env);

			return twiml((vr) => {
				gatherMenu(vr, {
					action: `${baseUrl}/ivr/l3/billing/handle`,
					prompt:
						'Insurance and Billing. Press 1 for copay estimates. Press 2 for coverage questions. Press 3 for prior authorization status.',
				});
				vr.say({ voice: 'alice' }, 'No input received.');
				vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/billing`);
			});
		}

		if (path === '/ivr/l3/billing/handle' && method === 'POST') {
			const s = await getSession(callSid, env);
			const d = normalizeDigit(body.Digits);
			if (!s) return new Response('Missing CallSid', { status: 400 });

			if (d !== '1' && d !== '2' && d !== '3') {
				s.retryCount++;
				await saveSession(s, env);
			}

			return twiml((vr) => {
				if (d === '1' || d === '2' || d === '3') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l4/identity`);
				} else if (d === '0') {
					vr.say({ voice: 'alice' }, 'Please listen carefully to the options.');
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/billing`);
				} else {
					sayInvalidAndRedirect(vr, `${baseUrl}/ivr/l3/billing`);
				}
			});
		}

		if (path === '/ivr/l3/store-detail' && method === 'POST') {
			const s = await getSession(callSid, env);
			if (!s) return new Response('Missing CallSid', { status: 400 });
			s.level = 3;
			await saveSession(s, env);

			return twiml((vr) => {
				gatherMenu(vr, {
					action: `${baseUrl}/ivr/l3/store-detail/handle`,
					prompt:
						'Store details. Press 1 to hear this information again. Press 2 to continue. Press 9 to return to the previous menu.',
				});
				vr.say({ voice: 'alice' }, 'No input received.');
				vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/store-detail`);
			});
		}

		if (path === '/ivr/l3/store-detail/handle' && method === 'POST') {
			const s = await getSession(callSid, env);
			const d = normalizeDigit(body.Digits);
			if (!s) return new Response('Missing CallSid', { status: 400 });

			if (d !== '1' && d !== '2' && d !== '9') {
				s.retryCount++;
				await saveSession(s, env);
			}

			return twiml((vr) => {
				if (d === '1') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/store-detail`);
				} else if (d === '2') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l4/identity`);
				} else if (d === '9') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l2/store`);
				} else if (d === '0') {
					vr.say({ voice: 'alice' }, 'Please listen carefully to the options.');
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/store-detail`);
				} else {
					sayInvalidAndRedirect(vr, `${baseUrl}/ivr/l3/store-detail`);
				}
			});
		}

		if (path === '/ivr/l3/other-detail' && method === 'POST') {
			const s = await getSession(callSid, env);
			if (!s) return new Response('Missing CallSid', { status: 400 });
			s.level = 3;
			await saveSession(s, env);

			return twiml((vr) => {
				gatherMenu(vr, {
					action: `${baseUrl}/ivr/l3/other-detail/handle`,
					prompt:
						'Other inquiries. Press 1 to continue. Press 2 to hear policy information. Press 9 to return to the previous menu.',
				});
				vr.say({ voice: 'alice' }, 'No input received.');
				vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/other-detail`);
			});
		}

		if (path === '/ivr/l3/other-detail/handle' && method === 'POST') {
			const s = await getSession(callSid, env);
			const d = normalizeDigit(body.Digits);
			if (!s) return new Response('Missing CallSid', { status: 400 });

			if (d !== '1' && d !== '2' && d !== '9') {
				s.retryCount++;
				await saveSession(s, env);
			}

			return twiml((vr) => {
				if (d === '1' || d === '2') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l4/identity`);
				} else if (d === '9') {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l2/other`);
				} else if (d === '0') {
					vr.say({ voice: 'alice' }, 'Please listen carefully to the options.');
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/other-detail`);
				} else {
					sayInvalidAndRedirect(vr, `${baseUrl}/ivr/l3/other-detail`);
				}
			});
		}

		// L4: Identity method selection
		if (path === '/ivr/l4/identity' && method === 'POST') {
			const s = await getSession(callSid, env);
			if (!s) return new Response('Missing CallSid', { status: 400 });
			s.level = 4;
			await saveSession(s, env);

			return twiml((vr) => {
				gatherMenu(vr, {
					action: `${baseUrl}/ivr/l4/identity/handle`,
					prompt:
						'To continue, we need to verify your identity. Press 1 if you know your prescription number. Press 2 if you know your date of birth. Press 3 if you have your account P I N.',
				});
				vr.say({ voice: 'alice' }, 'No input received.');
				vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l4/identity`);
			});
		}

		if (path === '/ivr/l4/identity/handle' && method === 'POST') {
			const s = await getSession(callSid, env);
			const d = normalizeDigit(body.Digits);
			if (!s) return new Response('Missing CallSid', { status: 400 });

			if (d === '1') {
				s.identityMethod = 'rx';
				s.identityCollected = true;
				await saveSession(s, env);
				return twiml((vr) => {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l4/collect`);
				});
			} else if (d === '2') {
				s.identityMethod = 'dob';
				s.identityCollected = true;
				await saveSession(s, env);
				return twiml((vr) => {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l4/collect`);
				});
			} else if (d === '3') {
				s.identityMethod = 'pin';
				s.identityCollected = true;
				await saveSession(s, env);
				return twiml((vr) => {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l4/collect`);
				});
			} else {
				s.retryCount++;
				s.l4Failures++;
				await saveSession(s, env);
				return twiml((vr) => {
					if (s.l4Failures >= 3) {
						vr.say({ voice: 'alice' }, 'We are unable to verify your selection. Returning to the previous menu.');
						vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/status`);
					} else {
						sayInvalidAndRedirect(vr, `${baseUrl}/ivr/l4/identity`);
					}
				});
			}
		}

		// L4 collect: ask for digits
		if (path === '/ivr/l4/collect' && method === 'POST') {
			const s = await getSession(callSid, env);
			if (!s) return new Response('Missing CallSid', { status: 400 });
			s.level = 4;
			await saveSession(s, env);

			const prompts = {
				rx: 'Please enter your prescription number, followed by the pound sign.',
				dob: 'Please enter your date of birth as M M D D Y Y Y Y, followed by the pound sign.',
				pin: 'Please enter your account P I N, followed by the pound sign.',
			};

			const prompt = prompts[s.identityMethod] || 'Please enter the requested information, followed by the pound sign.';

			return twiml((vr) => {
				const g = vr.gather({
					action: `${baseUrl}/ivr/l4/collect/handle`,
					method: 'POST',
					input: 'dtmf',
					finishOnKey: '#',
					timeout: 8,
				});
				g.say({ voice: 'alice' }, prompt);

				vr.say({ voice: 'alice' }, 'No input received.');
				vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l4/collect`);
			});
		}

		if (path === '/ivr/l4/collect/handle' && method === 'POST') {
			const s = await getSession(callSid, env);
			const digits = (body.Digits || '').trim();
			if (!s) return new Response('Missing CallSid', { status: 400 });

			// Simulate occasional rejection to feel real.
			const tooShort = digits.length < 4;
			const pseudoFail = Math.random() < 0.25; // 25% chance of "system can't verify"

			if (tooShort || pseudoFail) {
				s.retryCount++;
				s.l4Failures++;
				await saveSession(s, env);

				return twiml((vr) => {
					if (s.l4Failures >= 3) {
						vr.say({ voice: 'alice' }, 'We could not verify your information. Returning to the previous menu.');
						vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l3/status`);
					} else {
						vr.say({ voice: 'alice' }, 'We could not verify that information.');
						vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l4/identity`);
					}
				});
			}

			// Passed identity "collection".
			s.identityVerified = true;
			await saveSession(s, env);
			return twiml((vr) => {
				vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l5/confirm`);
			});
		}

		// L5: Confirm + the ONLY agent transfer option
		if (path === '/ivr/l5/confirm' && method === 'POST') {
			const s = await getSession(callSid, env);
			if (!s) return new Response('Missing CallSid', { status: 400 });
			s.level = 5;
			await saveSession(s, env);

			return twiml((vr) => {
				vr.say({ voice: 'alice' }, 'Thank you. Your information has been received.');

				gatherMenu(vr, {
					action: `${baseUrl}/ivr/l5/confirm/handle`,
					prompt:
						'Press 1 to continue with automated service. Press 2 to repeat this menu. Press 3 to speak with a representative.',
				});

				vr.say({ voice: 'alice' }, 'No input received.');
				vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l5/confirm`);
			});
		}

		if (path === '/ivr/l5/confirm/handle' && method === 'POST') {
			const s = await getSession(callSid, env);
			const d = normalizeDigit(body.Digits);
			if (!s) return new Response('Missing CallSid', { status: 400 });

			const agentNumber = env.AGENT_NUMBER || '+15551234567';

			// Enforce transfer gate: only if identityVerified.
			if (d === '3') {
				if (!s.identityVerified) {
					s.retryCount++;
					await saveSession(s, env);
					return twiml((vr) => {
						vr.say({ voice: 'alice' }, 'We are unable to transfer your call at this time.');
						vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l4/identity`);
					});
				}

				// Optional: still reject once in a while to be extra painful.
				const rejectOnce = s.retryCount === 0 && Math.random() < 0.2;
				if (rejectOnce) {
					s.retryCount++;
					await saveSession(s, env);
					return twiml((vr) => {
						vr.say({ voice: 'alice' }, 'All representatives are currently assisting other callers.');
						vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l5/confirm`);
					});
				}

				return twiml((vr) => {
					vr.say({ voice: 'alice' }, 'Please hold while we transfer your call.');

					// Play 30 seconds of rick roll music before transferring
					// Using a publicly available rick roll audio URL (30 second clip)
					// You can set RICK_ROLL_URL env var to use your own audio file

					vr.play(rickRollUrl);
					let greets = ['Thank you for calling. Please remain calm — our confidence exceeds our accuracy',
						 '“You’ve reached the pharmacy. Any resemblance to real medicine is purely coincidental.',
						 'Hello. Your call is very important to us, just not urgent.',
						 'Thank you for calling. Please remain calm — our confidence exceeds our accuracy'];
					vr.say({ voice: 'alice' }, greets[Math.floor(Math.random() * greets.length)]);
                    vr.say({ voice: 'alice' }, 'Someone will be with you shortly. ‘Shortly’ is a flexible term.');
					vr.play(rickRollUrl);
					vr.say({ voice: 'alice' }, 'Welcome back. What can I help you with, before the next hold music finds us again?	');
					const dial = vr.dial({
						timeout: 20,
						callerId: body.To, // Twilio number receiving the call
					});
					dial.number(agentNumber);
				});
			}

			if (d === '2') {
				return twiml((vr) => {
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l5/confirm`);
				});
			}

			if (d === '1') {
				// Automated continuation: just a dead-end message.
				return twiml((vr) => {
					vr.say({ voice: 'alice' }, 'Automated service is currently unavailable. Goodbye.');
					vr.hangup();
				});
			}

			if (d === '0') {
				// 0 still isn't a shortcut.
				s.retryCount++;
				await saveSession(s, env);
				return twiml((vr) => {
					vr.say({ voice: 'alice' }, 'Please listen carefully to the options.');
					vr.redirect({ method: 'POST' }, `${baseUrl}/ivr/l5/confirm`);
				});
			}

			s.retryCount++;
			await saveSession(s, env);
			return twiml((vr) => {
				sayInvalidAndRedirect(vr, `${baseUrl}/ivr/l5/confirm`);
			});
		}

		// 404 for unknown routes
		console.warn('[IVR] No route matched:', { path, method, callSid });
		return new Response('Not Found', { status: 404 });
	},
};
