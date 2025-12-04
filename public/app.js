// Socket.IO connection
const socket = io();

// DOM elements
const chatContainer = document.getElementById("chatContainer");
const messageInput = document.getElementById("messageInput");
const chatForm = document.getElementById("chatForm");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const typingIndicator = document.getElementById("typingIndicator");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const errorToast = document.getElementById("errorToast");
const toastMessage = document.getElementById("toastMessage");

// State
let isConnected = false;
let messageCount = 0;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  setupSocketListeners();
  autoResizeTextarea();
});

// Event Listeners
function setupEventListeners() {
  chatForm.addEventListener("submit", handleSubmit);

  clearBtn.addEventListener("click", handleClear);

  messageInput.addEventListener("input", autoResizeTextarea);

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  });
}

// Socket.IO Listeners
function setupSocketListeners() {
  socket.on("connect", () => {
    isConnected = true;
    updateStatus("connected", "Connected");
    console.log("Connected to server");
  });

  socket.on("disconnect", () => {
    isConnected = false;
    updateStatus("disconnected", "Disconnected");
    console.log("Disconnected from server");
  });

  socket.on("chat:user-message", (data) => {
    // Message already added in handleSubmit
  });

  socket.on("chat:bot-message", (data) => {
    hideTypingIndicator();
    addMessage(data.message, "bot", data.timestamp);
    enableInput();
  });

  socket.on("chat:typing", (data) => {
    if (data.isTyping) {
      showTypingIndicator();
    } else {
      hideTypingIndicator();
    }
  });

  socket.on("chat:error", (data) => {
    hideTypingIndicator();
    showError(data.error);
    enableInput();
  });

  socket.on("chat:cleared", () => {
    clearMessages();
  });
}

// Handle form submission
function handleSubmit(e) {
  e.preventDefault();

  const message = messageInput.value.trim();

  if (!message || !isConnected) {
    return;
  }

  // Add user message to UI immediately
  addMessage(message, "user", Date.now());

  // Send to server
  socket.emit("chat:message", { message });

  // Clear input and disable
  messageInput.value = "";
  autoResizeTextarea();
  disableInput();
}

// Handle clear history
function handleClear() {
  if (confirm("Are you sure you want to clear the conversation history?")) {
    socket.emit("chat:clear");
  }
}

// Add message to chat
function addMessage(text, type, timestamp) {
  // Remove welcome message if this is the first message
  if (messageCount === 0) {
    const welcomeMsg = chatContainer.querySelector(".welcome-message");
    if (welcomeMsg) {
      welcomeMsg.style.animation = "fadeOut 0.3s ease-out";
      setTimeout(() => welcomeMsg.remove(), 300);
    }
  }

  messageCount++;

  const messageDiv = document.createElement("div");
  messageDiv.className = `message message-${type}`;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  const textDiv = document.createElement("div");
  textDiv.className = "message-text";

  // Format bot messages with markdown-like syntax
  if (type === "bot") {
    textDiv.innerHTML = formatBotMessage(text);
  } else {
    textDiv.textContent = text;
  }

  const timestampDiv = document.createElement("span");
  timestampDiv.className = "message-timestamp";
  timestampDiv.textContent = formatTime(timestamp);

  contentDiv.appendChild(textDiv);
  contentDiv.appendChild(timestampDiv);
  messageDiv.appendChild(contentDiv);

  chatContainer.appendChild(messageDiv);
  scrollToBottom();
}

// Format bot messages with basic markdown-like rendering
function formatBotMessage(text) {
  // Escape HTML
  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Format bold text (**text**)
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Format code blocks (```code```)
  formatted = formatted.replace(/```(.+?)```/gs, "<code>$1</code>");

  // Format inline code (`code`)
  formatted = formatted.replace(/`(.+?)`/g, "<code>$1</code>");

  // Convert newlines to <br>
  formatted = formatted.replace(/\n/g, "<br>");

  // Format numbered lists (1. item)
  formatted = formatted.replace(/^(\d+)\.\s/gm, "<br>$1. ");

  return formatted;
}

// Clear all messages
function clearMessages() {
  // Remove all messages
  const messages = chatContainer.querySelectorAll(".message");
  messages.forEach((msg) => msg.remove());

  messageCount = 0;

  // Show welcome message again
  const welcomeDiv = document.createElement("div");
  welcomeDiv.className = "welcome-message";
  welcomeDiv.innerHTML = `
        <div class="welcome-icon">💬</div>
        <h2>Welcome to DBAgent!</h2>
        <p>I'm your AI-powered database assistant. I can help you:</p>
        <ul>
            <li>🔍 Query your database using natural language</li>
            <li>📊 Analyze database schemas and relationships</li>
            <li>📈 Generate insights from your data</li>
            <li>🧠 Remember our conversation context</li>
        </ul>
        <p class="welcome-hint">Try asking: "Show me all tables" or "Find customers who spent over $1000"</p>
    `;
  chatContainer.appendChild(welcomeDiv);
}

// Show/hide typing indicator
function showTypingIndicator() {
  typingIndicator.style.display = "flex";
  scrollToBottom();
}

function hideTypingIndicator() {
  typingIndicator.style.display = "none";
}

// Update connection status
function updateStatus(status, text) {
  statusDot.className = `status-dot ${status}`;
  statusText.textContent = text;
}

// Show error toast
function showError(message) {
  toastMessage.textContent = message;
  errorToast.style.display = "block";

  setTimeout(() => {
    errorToast.style.display = "none";
  }, 5000);
}

// Enable/disable input
function disableInput() {
  messageInput.disabled = true;
  sendBtn.disabled = true;
}

function enableInput() {
  messageInput.disabled = false;
  sendBtn.disabled = false;
  messageInput.focus();
}

// Auto-resize textarea
function autoResizeTextarea() {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
}

// Format timestamp
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

// Scroll to bottom
function scrollToBottom() {
  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
}

// Add fadeOut animation
const style = document.createElement("style");
style.textContent = `
    @keyframes fadeOut {
        from {
            opacity: 1;
            transform: scale(1);
        }
        to {
            opacity: 0;
            transform: scale(0.95);
        }
    }
`;
document.head.appendChild(style);

