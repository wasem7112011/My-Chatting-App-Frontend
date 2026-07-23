"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { socket } from "../../lib/socket";

interface User {
  _id: string;
  name: string;
  email: string;
  lastSeenAt: string | Date;
  state: "online" | "offline";
  typing?: boolean;
}

interface ChatUser extends User {
  lastMessage?: string;
  updatedAt: string | Date;
  unreadCount?: number;
}

interface Message {
  _id?: string;
  senderId: string;
  receiverId: string;
  message: string;
  isFile?: boolean;
  isVoice?: boolean;
  fileType?: string;
  fileName?: string;
  stats: string;
  isEdited?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export default function UserPage() {
  const params = useParams();
  const userId = params.id as string;

  const [user, setUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [chats, setChats] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sideBarTap, setSideBarTap] = useState<"chats" | "new chat">("chats");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const selectedUserRef = useRef<User | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handleOutsideClick = () => setActiveMenuId(null);
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  useEffect(() => {
    notificationAudioRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2357/2357-84.wav");
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    let isMounted = true;

    async function fetchInitialData() {
      try {
        const [userRes, allUsersRes, chatsRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/user/${userId}`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/users?userId=${userId}`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/chats/${userId}`)
        ]);

        if (!userRes.ok || !allUsersRes.ok || !chatsRes.ok) {
          throw new Error("One of the API requests failed");
        }

        const userData = await userRes.json();
        const allUsersData = await allUsersRes.json();
        const chatsData = await chatsRes.json();

        if (isMounted) {
          setUser(userData.user);
          setAllUsers(allUsersData.users);
          setChats(chatsData.chats || []);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    }

    fetchInitialData();
    return () => { isMounted = false; };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    socket.connect();
    socket.emit("join", String(userId));

    return () => {
      socket.disconnect();
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const handleUsersUpdated = (users: User[]) => {
      const filtered = users.filter((u) => String(u._id) !== String(userId));
      setAllUsers(filtered);

      setChats((prevChats) =>
        prevChats.map((chat) => {
          const updatedUser = users.find((u) => String(u._id) === String(chat._id));
          return updatedUser
            ? { ...chat, state: updatedUser.state, name: updatedUser.name, email: updatedUser.email, lastSeenAt: updatedUser.lastSeenAt }
            : chat;
        })
      );

      setSelectedUser((prev) => {
        if (!prev) return null;
        return users.find((u) => String(u._id) === String(prev._id)) || prev;
      });
    };

    socket.on("usersUpdated", handleUsersUpdated);
    return () => { socket.off("usersUpdated", handleUsersUpdated); };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const handleReceiveMessage = (newMessage: Message) => {
      const currentUserId = String(userId);
      const activeChatUserId = selectedUserRef.current ? String(selectedUserRef.current._id) : null;
      const msgSenderId = String(newMessage.senderId);
      const msgReceiverId = String(newMessage.receiverId);

      const isMessageFromActiveChat =
        (msgSenderId === activeChatUserId && msgReceiverId === currentUserId) ||
        (msgSenderId === currentUserId && msgReceiverId === activeChatUserId);

      if (isMessageFromActiveChat) {
        setMessages((prev) => {
          const exists = prev.some((m) => m._id === newMessage._id || (m.createdAt === newMessage.createdAt && m.message === newMessage.message));
          return exists ? prev : [...prev, newMessage];
        });

        if (msgSenderId !== String(userId)) {
          socket.emit("markAsSeen", { senderId: msgSenderId, receiverId: String(userId) });
        }
      } else if (msgSenderId !== currentUserId) {
        notificationAudioRef.current?.play().catch(() => {});
        
        const senderUser = allUsers.find((u) => String(u._id) === msgSenderId);
        if (Notification.permission === "granted") {
          new Notification(senderUser?.name || "رسالة جديدة", {
            body: newMessage.isVoice ? "🎙️ Voice message" : newMessage.isFile ? `📁 ${newMessage.fileName}` : newMessage.message,
          });
        }
      }

      const otherUserId = msgSenderId === currentUserId ? msgReceiverId : msgSenderId;
      const displayText = newMessage.isVoice ? "🎙️ Voice message" : newMessage.isFile ? `📁 ${newMessage.fileName}` : newMessage.message;

      setChats((prevChats) => {
        const exists = prevChats.some((c) => String(c._id) === otherUserId);
        if (exists) {
          return prevChats.map((c) =>
            String(c._id) === otherUserId
              ? { 
                  ...c, 
                  lastMessage: displayText, 
                  updatedAt: new Date(),
                  unreadCount: isMessageFromActiveChat ? 0 : (c.unreadCount || 0) + 1 
                }
              : c
          );
        }
        const targetUser = allUsers.find((u) => String(u._id) === otherUserId);
        if (targetUser) {
          return [{ 
            ...targetUser, 
            lastMessage: displayText, 
            updatedAt: new Date(),
            unreadCount: isMessageFromActiveChat ? 0 : 1 
          }, ...prevChats];
        }
        return prevChats;
      });
    };

    const handleMessageEdited = ({ messageId, newMessageText }: { messageId: string; newMessageText: string }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, message: newMessageText, isEdited: true } : m))
      );

      setChats((prevChats) =>
        prevChats.map((c) => {
          if (selectedUserRef.current && String(c._id) === String(selectedUserRef.current._id)) {
            return { ...c, lastMessage: newMessageText, updatedAt: new Date() };
          }
          return c;
        })
      );
    };

    const handleMessageDeleted = ({ messageId }: { messageId: string }) => {
      setMessages((prev) => {
        const updatedMessages = prev.filter((m) => m._id !== messageId);
        
        setChats((prevChats) =>
          prevChats.map((c) => {
            if (selectedUserRef.current && String(c._id) === String(selectedUserRef.current._id)) {
              const lastMsg = updatedMessages[updatedMessages.length - 1];
              return {
                ...c,
                lastMessage: lastMsg ? (lastMsg.isVoice ? "🎙️ Voice message" : lastMsg.isFile ? `📁 ${lastMsg.fileName}` : lastMsg.message) : "🗑️ Deleted a message",
                updatedAt: new Date()
              };
            }
            return c;
          })
        );

        return updatedMessages;
      });
    };

    socket.on("receiveMessage", handleReceiveMessage);
    socket.on("messageEdited", handleMessageEdited);
    socket.on("messageDeleted", handleMessageDeleted);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
      socket.off("messageEdited", handleMessageEdited);
      socket.off("messageDeleted", handleMessageDeleted);
    };
  }, [userId, allUsers]);

  useEffect(() => {
    if (search.trim() === "") {
      setFilteredUsers(allUsers);
    } else {
      const lowerSearch = search.toLowerCase();
      setFilteredUsers(
        allUsers.filter((u) =>
          u.name.toLowerCase().includes(lowerSearch) ||
          u.email.toLowerCase().includes(lowerSearch)
        )
      );
    }
  }, [search, allUsers]);

  useEffect(() => {
    if (!userId) return;

    const handleMessagesSeen = ({ senderId, receiverId }: { senderId: string; receiverId: string }) => {
      const activeChatUserId = selectedUserRef.current ? String(selectedUserRef.current._id) : null;

      if (activeChatUserId && String(senderId) === userId && String(receiverId) === activeChatUserId) {
        setMessages((prev) =>
          prev.map((m) => (m.stats === "not seen" ? { ...m, stats: "seen" } : m))
        );
      }
    };

    socket.on("messagesSeen", handleMessagesSeen);
    return () => { socket.off("messagesSeen", handleMessagesSeen); };
  }, [userId]);

  useEffect(() => {
    const handleTyping = ({ senderId, typing }: { senderId: string; typing: boolean }) => {
      setSelectedUser((prev) => {
        if (!prev || String(prev._id) !== String(senderId)) return prev;
        return { ...prev, typing };
      });

      setChats((prev) => prev.map((chat) => String(chat._id) === String(senderId) ? { ...chat, typing } : chat));
    };

    socket.on("typing", handleTyping);
    return () => { socket.off("typing", handleTyping); };
  }, []);

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selectedUser || !message.trim()) return;

    socket.emit("typing", { senderId: userId, receiverId: selectedUser._id, typing: false });

    const newMessageObj: Message = {
      senderId: String(user._id),
      receiverId: String(selectedUser._id),
      message: message,
      stats: "not seen",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    socket.emit("sendMessage", newMessageObj);
    setMessage("");
  }

  function submitEdit(messageId: string) {
    if (!editingText.trim() || !selectedUser) return;
    socket.emit("editMessage", {
      messageId,
      newMessageText: editingText,
      receiverId: selectedUser._id,
      senderId: userId
    });
    setEditingMessageId(null);
    setEditingText("");
  }

  function deleteMessage(messageId: string) {
    if (!selectedUser || !confirm("Are you sure you want to delete this message?")) return;
    socket.emit("deleteMessage", {
      messageId,
      receiverId: selectedUser._id,
      senderId: userId
    });
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedUser) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        const isVoiceFile = file.type.startsWith("audio/") || file.name.endsWith(".ogg") || file.name.endsWith(".mp3") || file.name.endsWith(".wav") || file.name.endsWith(".m4a");
        const newMessageObj: Message = {
          senderId: String(user._id),
          receiverId: String(selectedUser._id),
          message: data.url,
          isFile: true,
          isVoice: isVoiceFile,
          fileType: file.type,
          fileName: file.name,
          stats: "not seen",
          createdAt: new Date(),
          updatedAt: new Date()
        };
        socket.emit("sendMessage", newMessageObj);
      } else {
        alert("Upload failed: " + data.message);
      }
    } catch (err) {
      console.error(err);
      alert("Error uploading file");
    } finally {
      setUploading(false);
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/ogg" });
        const audioFile = new File([audioBlob], `voice-${Date.now()}.ogg`, { type: "audio/ogg" });
        
        setUploading(true);
        const formData = new FormData();
        formData.append("file", audioFile);

        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/upload`, {
            method: "POST",
            body: formData,
          });
          const data = await res.json();

          if (res.ok && user && selectedUser) {
            const newMessageObj: Message = {
              senderId: String(user._id),
              receiverId: String(selectedUser._id),
              message: data.url,
              isFile: true,
              isVoice: true,
              fileType: "audio/ogg",
              fileName: audioFile.name,
              stats: "not seen",
              createdAt: new Date(),
              updatedAt: new Date()
            };
            socket.emit("sendMessage", newMessageObj);
          }
        } catch (err) {
          console.error("Voice upload failed", err);
        } finally {
          setUploading(false);
        }

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied", err);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  function formatLastSeen(date: string | Date) {
    const lastSeen = new Date(date);
    const now = new Date();
    const isToday = lastSeen.toDateString() === now.toDateString();

    if (isToday) {
      return lastSeen.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    }
    return lastSeen.toLocaleDateString("ar-EG");
  }

  return (
    <div className="flex h-screen overflow-hidden transition-colors duration-200 bg-slate-950 text-slate-100">
      <aside className={`w-full md:w-85 shadow-xl flex flex-col shrink-0 transition-all duration-300 bg-slate-900 border-r border-slate-800 ${selectedUser ? "hidden md:flex" : "flex"}`}>
        <div className="p-6 space-y-4 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">Chats</h1>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-linear-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center font-bold shadow">
                {user?.name?.charAt(0)}
              </div>
              <div>
                <p className="font-semibold truncate max-w-25 text-slate-200">{user?.name}</p>
              </div>
            </div>
          </div>
          <div className="flex p-1 rounded-xl bg-slate-800">
            <button onClick={() => setSideBarTap("chats")} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all text-white ${sideBarTap === "chats" ? "shadow-sm font-bold bg-slate-700" : "opacity-60 hover:opacity-100"}`}>Recent</button>
            <button onClick={() => setSideBarTap("new chat")} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all text-white ${sideBarTap === "new chat" ? "shadow-sm font-bold bg-slate-700" : "opacity-60 hover:opacity-100"}`}>New Chat</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sideBarTap === "chats" ? (
            chats.length === 0 ? <p className="text-center text-sm mt-4 opacity-50">No active chats yet</p> : 
            [...chats].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map((c) => (
              <button key={c._id} onClick={async () => {
                setSelectedUser({ ...c, typing: false });
                setChats(prev => prev.map(chat => chat._id === c._id ? { ...chat, unreadCount: 0 } : chat));
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/messages?senderId=${userId}&receiverId=${c._id}`);
                const data = await res.json();
                setMessages(data.messages);
                socket.emit("markAsSeen", { senderId: c._id, receiverId: userId });
              }} className={`w-full text-left rounded-2xl p-4 transition-all duration-200 border ${selectedUser?._id === c._id ? "bg-blue-600 text-white border-blue-600 shadow-lg" : "bg-slate-800/40 border-slate-800 hover:shadow-md hover:bg-slate-800/60"}`}>
                <div className="flex items-center justify-between">
                  <h2 className={`font-semibold ${selectedUser?._id === c._id ? "text-white" : "text-slate-200"}`}>{c.name}</h2>
                  <div className="flex items-center gap-2">
                    {c.unreadCount && c.unreadCount > 0 && selectedUser?._id !== c._id ? (
                      <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-bounce">
                        {c.unreadCount}
                      </span>
                    ) : null}
                    <span className={`text-xs font-semibold ${c.state === "online" ? "text-emerald-500" : "text-rose-500"}`}>{c.state === "online" ? "●" : "○"}</span>
                  </div>
                </div>
                <p className={`text-sm mt-1 truncate ${selectedUser?._id === c._id ? "text-blue-100" : "text-slate-400"} ${c.unreadCount && c.unreadCount > 0 && selectedUser?._id !== c._id ? "font-bold text-white" : ""}`}>{c.lastMessage || c.email}</p>
              </button>
            ))
          ) : (
            <>
              <div className="px-1"><input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email..." className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none bg-slate-800 border-slate-700 text-white placeholder-slate-400 focus:border-slate-500" /></div>
              {filteredUsers.map((u) => (
                <button key={u._id} onClick={async () => {
                  setSelectedUser({ ...u, typing: false });
                  setChats(prev => prev.map(chat => chat._id === u._id ? { ...chat, unreadCount: 0 } : chat));
                  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/messages?senderId=${userId}&receiverId=${u._id}`);
                  const data = await res.json();
                  setMessages(data.messages);
                  socket.emit("markAsSeen", { senderId: u._id, receiverId: userId });
                }} className={`w-full text-left rounded-2xl p-4 transition-all duration-200 border ${selectedUser?._id === u._id ? "bg-blue-600 text-white border-blue-600 shadow-lg" : "bg-slate-800/40 border-slate-800 hover:shadow-md hover:bg-slate-800/60"}`}>
                  <div className="flex items-center justify-between">
                    <h2 className={`font-semibold ${selectedUser?._id === u._id ? "text-white" : "text-slate-200"}`}>{u.name}</h2>
                    <span className={`text-xs font-semibold ${u.state === "online" ? "text-emerald-500" : "text-rose-500"}`}>{u.state === "online" ? "●" : "○"}</span>
                  </div>
                  <p className={`text-sm mt-1 ${selectedUser?._id === u._id ? "text-blue-100" : "text-slate-400"}`}>{u.email}</p>
                </button>
              ))}
            </>
          )}
        </div>
      </aside>

      <main className={`flex-1 transition-all duration-300 bg-slate-955 ${!selectedUser ? "hidden md:flex" : "flex"}`}>
        {selectedUser ? (
          <div className="h-full flex flex-col w-full bg-slate-950">
            <div className="shadow-sm px-4 md:px-8 py-5 flex items-center justify-between bg-slate-900 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedUser(null)} className="md:hidden p-2 -ml-2 rounded-lg text-slate-400 hover:text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                </button>
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-white">{selectedUser.name}</h2>
                  <p className="text-sm truncate max-w-45 sm:max-w-xs text-slate-400">{selectedUser.email}</p>
                </div>
              </div>
              <div className="status flex gap-2 items-center">
                {selectedUser.state === "offline" && selectedUser.lastSeenAt && <p className="text-xs text-slate-400">Last seen {formatLastSeen(selectedUser.lastSeenAt)}</p>}
                <span className="font-semibold text-xs md:text-sm px-3 md:px-4 py-1.5 md:py-2 rounded-full bg-emerald-955/40 text-emerald-400">{selectedUser.typing ? "Typing..." : selectedUser.state === "online" ? "Online" : "Offline"}</span>
              </div>
            </div>

            <div className="flex flex-col flex-1 p-4 md:p-8 overflow-y-auto space-y-4 bg-slate-955">
              {messages.map((m, index) => {
                const isMe = String(m.senderId) === String(userId);
                const msgId = m._id?.toString() ?? `temp-${index}`;
                const isEditingThis = editingMessageId === msgId;

                return (
                  <div key={msgId} className={`flex flex-col w-full group ${isMe ? "items-end" : "items-start"}`}>
                    <div className="flex items-center gap-2 max-w-[75%] relative">
                      
                      {isMe && !isEditingThis && (
                        <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === msgId ? null : msgId);
                            }} 
                            className="p-1 rounded-lg hover:bg-slate-850 text-slate-400 hover:text-white"
                          >
                            ⋮
                          </button>
                          
                          {activeMenuId === msgId && (
                            <div className="absolute right-0 bottom-7 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 w-24 z-50 animate-in fade-in zoom-in-95 duration-100">
                              {!m.isFile && (
                                <button 
                                  onClick={() => {
                                    setEditingMessageId(msgId);
                                    setEditingText(m.message);
                                  }} 
                                  className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                                >
                                  ✏️ Edit
                                </button>
                              )}
                              <button 
                                onClick={() => deleteMessage(msgId)} 
                                className="w-full text-left px-3 py-1.5 text-xs text-rose-400 hover:bg-slate-700"
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className={`px-4 py-3 rounded-2xl text-sm md:text-base shadow-sm wrap-break-word ${isMe ? "bg-blue-600 text-white rounded-tr-none" : "rounded-tl-none border bg-slate-900 border-slate-800 text-slate-100"}`}>
                        {isEditingThis ? (
                          <div className="flex flex-col gap-2 min-w-50">
                            <input 
                              type="text" 
                              value={editingText} 
                              onChange={(e) => setEditingText(e.target.value)}
                              className="w-full px-2 py-1 text-sm rounded bg-slate-700 text-white border border-slate-600 outline-none"
                              autoFocus
                            />
                            <div className="flex justify-end gap-1">
                              <button onClick={() => setEditingMessageId(null)} className="px-2 py-0.5 text-xs bg-slate-500 rounded hover:bg-slate-600">Cancel</button>
                              <button onClick={() => submitEdit(msgId)} className="px-2 py-0.5 text-xs bg-emerald-600 rounded hover:bg-emerald-700">Save</button>
                            </div>
                          </div>
                        ) : m.isFile ? (
                          m.isVoice ? (
                            <audio src={m.message} controls className="max-w-60 sm:max-w-xs audio-dark outline-none accent-blue-600" />
                          ) : m.fileType?.startsWith("image/") ? (
                            <img 
                              src={m.message} 
                              alt={m.fileName} 
                              className="w-full max-w-70 sm:max-w-xs h-auto max-h-60 object-cover rounded-lg cursor-pointer" 
                              onClick={() => window.open(m.message, "_blank")}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                const parent = e.currentTarget.parentElement;
                                if (parent && !parent.querySelector(".fallback-text")) {
                                  const span = document.createElement("span");
                                  span.className = "fallback-text text-slate-400 italic text-xs block p-2";
                                  span.innerText = "📁 This file is no longer available";
                                  parent.appendChild(span);
                                }
                              }}
                            />
                          ) : (
                            <a href={m.message} target="_blank" rel="noreferrer" className="underline flex items-center gap-2 text-indigo-300 hover:text-indigo-100">📁 {m.fileName || "Download File"}</a>
                          )
                        ) : (
                          <span>{m.message}</span>
                        )}
                      </div>

                    </div>
                    
                    <div className="flex items-center gap-1.5 mt-0.5 px-1 text-[10px] text-slate-500 font-medium">
                      {m.isEdited && <span className="italic text-slate-400">(edited)</span>}
                      {isMe && <span>{m.stats === "seen" ? "✓✓ Seen" : "✓ Sent"}</span>}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 md:p-5 bg-slate-900 border-t border-slate-800">
              <form onSubmit={sendMessage} className="flex gap-2 h-full items-center">
                <label className="p-3 bg-slate-800 border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-700 transition duration-200">
                  <input type="file" onChange={handleFileUpload} className="hidden" disabled={uploading || isRecording} />
                  {uploading ? "⏳" : "📎"}
                </label>
                
                <input placeholder={uploading ? "Uploading..." : isRecording ? "Recording audio..." : "Type a message..."} value={message} disabled={uploading || isRecording} onChange={(e) => {
                  setMessage(e.target.value);
                  if (!selectedUser) return;
                  socket.emit("typing", { senderId: userId, receiverId: selectedUser._id, typing: true });
                  if (typingTimeout.current) clearTimeout(typingTimeout.current);
                  typingTimeout.current = setTimeout(() => {
                    socket.emit("typing", { senderId: userId, receiverId: selectedUser._id, typing: false });
                  }, 1000);
                }} className="w-full rounded-xl border px-4 py-3 outline-none bg-slate-800 border-slate-700 text-white focus:border-slate-500 disabled:opacity-50" />
                
                <button type="button" onClick={isRecording ? stopRecording : startRecording} disabled={uploading} className={`p-3 border rounded-xl transition duration-200 active:scale-95 text-xl ${isRecording ? "bg-red-600 border-red-600 animate-pulse text-white" : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"}`}>
                  {isRecording ? "🛑" : "🎙️"}
                </button>

                <button type="submit" disabled={uploading || isRecording || !message.trim()} className="bg-blue-600 text-white px-7 py-3 rounded-xl font-bold hover:bg-blue-700 active:scale-95 shadow-md disabled:opacity-50">Send</button>
              </form>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center w-full bg-slate-950">
            <div className="text-center px-4">
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-linear-to-br from-indigo-500 to-blue-600 mx-auto mb-6 flex items-center justify-center text-white text-3xl md:text-4xl font-bold">💬</div>
              <h2 className="text-2xl md:text-3xl font-bold text-white">No User Selected</h2>
              <p className="text-sm md:text-base mt-3 opacity-60">Select a user from the sidebar to start chatting.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}