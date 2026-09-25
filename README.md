# My Chatting App — Frontend

A modern real-time chatting application built with Next.js, React, TypeScript, Tailwind CSS, and Socket.IO.

The application provides real-time messaging between users with online/offline presence, typing indicators, message status, notifications, and other features found in modern messaging platforms.

## 🚀 Features

* 🔐 User registration and login
* 💬 Real-time one-to-one messaging
* ⚡ Real-time communication using Socket.IO
* 🟢 Online / offline user status
* ⌨️ Typing indicators
* ✓ Message seen status
* 🔔 Real-time notifications
* ✏️ Message editing
* 📁 File and voice message support
* 🔎 Search for users and conversations
* 💭 Recent and new chat sections
* 📱 Responsive interface for desktop and mobile
* 🔔 Toast notifications and confirmation dialogs

## 🛠️ Tech Stack

* **Next.js** — React framework using the App Router
* **React** — UI development
* **TypeScript** — Type-safe development
* **Tailwind CSS** — Responsive styling
* **Socket.IO Client** — Real-time communication
* **Lucide React** — Interface icons

## 🏗️ Project Structure

```text
src/
├── app/
│   ├── ...
│   └── [id]/
│       └── ...
├── components/
│   ├── ...
│   └── ...
└── utils/
    ├── ...
    └── ...
```

The application uses Next.js App Router with reusable components and utility modules for API and Socket.IO communication.

## 🔌 Backend

The frontend communicates with a separate Node.js / Express backend.

**Backend Repository:**
[My-Chatting-App-Backend](https://github.com/wasem7112011/My-Chatting-App-Backend)

The backend is responsible for authentication, database operations, messaging APIs, and real-time Socket.IO events.

## ⚙️ Getting Started

### Prerequisites

* Node.js 18+
* npm

### Installation

Clone the repository:

```bash
git clone https://github.com/wasem7112011/My-Chatting-App-Frontend.git
```

Navigate to the project:

```bash
cd My-Chatting-App-Frontend
```

Install dependencies:

```bash
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

Update the URLs if your backend is running on another address.

### Run the Development Server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## 🔄 Real-Time Communication

Socket.IO is used to maintain a persistent real-time connection between the client and server.

It is used for features such as:

* Sending and receiving messages instantly
* Online / offline presence
* Typing indicators
* Message seen updates
* Real-time notifications

## 📱 Responsive Design

The interface is designed to work across different screen sizes, including desktop and mobile devices.

## 📌 Related Repository

**Backend:**
[My-Chatting-App-Backend](https://github.com/wasem7112011/My-Chatting-App-Backend)
