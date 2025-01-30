# 🚀 Remark Notification Handler  

**A fully end-to-end encrypted (E2EE) and open-source notification handler for Remark Services, built with Electron.**  

## 🔒 Remark Notification Handler  

**Remark Notification Handler** is a secure and reliable notification system designed for **Remark Services**. Unlike traditional web browser notification APIs, which are often insecure and unreliable, **NotificationHandler** ensures complete **end-to-end encryption (E2EE)** for all transmitted data.  

This project was developed due to the lack of proper security measures in conventional notification systems. Most browser-based notification APIs do not offer **true E2EE**, making them vulnerable to interception and exploitation.  

By using **Electron (JavaScript, HTML, CSS)**, **NotificationHandler** provides a **self-contained** and **privacy-focused** solution for handling notifications without relying on third-party services.  

---

## 🔑 Security & Encryption  

**Remark Notification Handler** employs a **hybrid encryption** approach combining **AES (Advanced Encryption Standard) and RSA (Rivest-Shamir-Adleman) encryption** for maximum security.  

### How it Works:  
- **On each launch, the application generates a new RSA keypair** (public/private key).  
- The **public key** is used to request encrypted notification data from Remark Services.  
- Notifications are encrypted using **AES encryption**, with the AES key itself being encrypted using **RSA**.  
- Only the local NotificationHandler instance can **decrypt and display** the notification.  
- This ensures that notifications remain **fully private**, even if intercepted during transmission.  

This **AES-RSA hybrid encryption model** guarantees that only the intended recipient can read the notification content, preventing any unauthorized access.  

---

## ⚙️ Tech Stack  

- **Electron.js** – Cross-platform desktop app framework  
- **JavaScript (Node.js)** – Core backend logic  
- **HTML/CSS** – Frontend user interface  
- **AES-256 & RSA-4096** – End-to-end encryption  

---

## 📞 Contact  

For questions, feedback, or security concerns, please contact us via Remark Services.  
