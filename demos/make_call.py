# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client

# Set environment variables for your credentials
# Read more at http://twil.io/secure

account_sid = "AC37d3f5b2e1db89d7f3c1748176333954"
auth_token = "0f696728728175c49986aba61503f8c2"
client = Client(account_sid, auth_token)

call = client.calls.create(
  url="http://demo.twilio.com/docs/voice.xml",
  to="+13102540932",
  from_="+16198597172"
)

print(call.sid)