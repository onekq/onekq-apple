# ONEKQ Desktop App for Apple Silicon

**ONEKQ-Apple** is an on-device text-to-SQL app for devices with Apple Silicon, e.g. M1/2/3/4 processor.

---

## 🎯 Motivation

This app was built to help Mac users **with GPU** on their devices (mostly laptops) to run language models — all while keeping things simple with a clean and intuitive UI. **You don’t need to be online to run the app** once the model is downloaded.

---

## 🧑‍💻 User Journey

### 1. Hardware Detection

Initially, the app checks your device hardware. If no GPU is found, you'll be warned that performance will be slower.

![CPU](https://github.com/user-attachments/assets/f3d34051-17b9-4ec1-b52f-c162dcaf349b)

---

### 2. Share Your Schema

Paste your schemas in the left panel:

```sql
CREATE TABLE users (
  id INT,
  name TEXT
);
```
![overview](https://github.com/user-attachments/assets/5a7d7b50-c28d-4e68-b66f-f53e915500d2)

---

### 3. Natural Language Prompt → SQL

Describe what you want in plain English. The app will generate a SQL query in the right panel.

---

### 4. Syntax Checker

Syntax validity is key to qualities of prompt and SQL generation, typos or invalid schema will be flagged before model inference.

![syntax](https://github.com/user-attachments/assets/021ab46f-552a-4354-88aa-d9202b166662)

---

### 5. Model Download

The model will be downloaded from 🤗 HuggingFace 🤗 the first time you use it, then cached locally afterward.

![download](https://github.com/user-attachments/assets/d94920c0-7dd8-4125-bd7a-5c8ebc640ba4)

---

## 📦 Installation

👉 **[Download ONEKQ v0.1.0 DMG for macOS](https://github.com/onekq/onekq-apple/releases/latest)**

1. Open the DMG  
2. Drag **ONEKQ** into your Applications folder  
3. Launch and start using it locally

---

## 🔐 Security & Privacy

- Models are cached under the default location of HuggingFace:
  `~/.cache/huggingface/`
- Download progress is tracked in a log file at:  
  `~/Library/Application Support/ONEKQ/download_log.txt`

No network calls after the first model download. Nothing is sent to the cloud.

---

## 🛠️ Troubleshooting

To see debug traces, start the app from the terminal.

```bash
/Applications/ONEKQ.app/Contents/MacOS/onekq
```

Still stuck? [Open an issue on GitHub](https://github.com/onekq/onekq-apple/issues)

---

## ✉️ Contact

📫 developers@onekq.ai
