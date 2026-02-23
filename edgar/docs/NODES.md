# 🦞 OpenClaw Node Setup Tutorial

This guide walks you through installing, pairing, and running an OpenClaw node using systemd.

---

## 📦 1. Install the Node Service

Run the following command to install the node service:

```bash
openclaw node install
```

This will create the systemd service file and prepare your environment.

---

## 🔗 2. Check Pending Devices

List devices waiting for approval:

```bash
openclaw devices list
```

You should see a **Pending** device with a request ID.

Example:

```
Pending (1)
Request: 1b3d4447-4e57-45e4-9688-b2c3177f3aed
```

---

## ✅ 3. Approve the Node

Approve the pending node using its request ID:

```bash
openclaw devices approve <<NODE_REQUEST_ID>>
```

Replace `<<NODE_REQUEST_ID>>` with the actual ID from the previous step.

This step is **required**. Without approval, the node will fail with:

```
pairing required
```

---

## ⚙️ 4. Enable and Start the Service

Enable the node service so it starts automatically:

```bash
systemctl --user enable openclaw-node.service
```

Start the service:

```bash
systemctl --user start openclaw-node.service
```

---

## 🔍 5. Verify Node Status

Check if the node is running:

```bash
openclaw node status
```

Expected output:

```
Service: systemd (enabled)
Command: /usr/bin/node /home/ubuntu/openclaw/dist/index.js node run --host 127.0.0.1 --port 18789
Service file: /home/ubuntu/.config/systemd/user/openclaw-node.service
Runtime: running (state active, sub running)
```

If you see:

```
Runtime: running
```

✅ Your node is successfully running.

---

## 🧠 Real example (this tutorial case)

In this setup, the issue happened because:

```bash
openclaw doctor --fix
```

👉 This changed internal configuration and caused the node to lose its pairing.

After re-approving the device and restarting the services, everything worked again.

---

## 💡 Key takeaway

- Nodes always authenticate with the gateway
- Pairing can be invalidated silently
- If you see `pairing required`, just:
  - approve again
  - restart services

---

## 🚀 Pro tip

If your node suddenly stops:

1. Run `openclaw devices list`
2. Look for `Pending`
3. Approve
4. Restart services

👉 This fixes most issues in seconds

---

Se quiser, posso agora transformar esse tutorial em um README profissional (com badges, diagramas e arquitetura) ou adicionar uma seção de **multi-node setup** 👍
