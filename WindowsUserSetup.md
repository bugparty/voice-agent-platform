# Windows Setup Guide

To run this project on Windows, you need **WSL**, a **Linux distro (Ubuntu)**, and **Docker Desktop**. Prefer `winget` when the package is available.

---

## 1. Install WSL

```powershell
winget install Microsoft.WSL --accept-package-agreements
```

If that fails or the package is not found, run in **PowerShell as Administrator**:

```powershell
wsl --install
```

Restart when prompted.

---

## 2. Install Ubuntu (in WSL)

If you used `wsl --install` without `-d Ubuntu`, add Ubuntu:

```powershell
winget install Canonical.Ubuntu --accept-package-agreements
```

Or from PowerShell (Admin):

```powershell
wsl --install -d Ubuntu
```

Open **Ubuntu** from the Start menu, finish the initial username/password setup, then close the window.

---

## 3. Install Docker Desktop for Windows

```powershell
winget install Docker.DockerDesktop --accept-package-agreements
```

After installation:

1. Start **Docker Desktop**.
2. In **Settings → Resources → WSL Integration**, turn on integration for your Ubuntu distro.
3. Reboot if WSL or Docker ask you to.

---

## 4. Verify

In PowerShell or Ubuntu (WSL):

```powershell
wsl -l -v
```

Ubuntu should be **WSL 2**. Then:

```bash
docker --version
```

---

**Tip:** All `winget` commands can be run in a normal (non‑Admin) PowerShell unless noted. Use `--accept-package-agreements` to avoid interactive prompts where supported.
