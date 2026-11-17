/* ══════════════════════════════════════════════
   BrewMind AI Café — Frontend Logic
   ══════════════════════════════════════════════ */

const API = "/api";

/* ───────────────────── STATE ───────────────────── */
let state = {
  userId: null, userName: "Guest",
  weather: "normal", mood: null,
  cart: [],            // [{id, name, price, qty, emoji, prepTime, tags}]
  menu: [], categories: [],
  currentPage: "home",
  lastOrderId: null,
};

/* ───────────────────── UTILS ───────────────────── */
function uid() {
  return "user_" + Math.random().toString(36).slice(2, 10);
}

function fmt(n) { return "₹" + n; }

function toast(msg, type = "info") {
  const c = document.getElementById("toastContainer");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  const icon = type === "success" ? "✅" : type === "warning" ? "⚠️" : type === "error" ? "❌" : "ℹ️";
  t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(`page-${name}`).classList.add("active");
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.toggle("active", t.dataset.page === name));
  state.currentPage = name;
  if (name === "track") loadQueue();
}

/* ───────────────────── LOADER ───────────────────── */
window.addEventListener("load", () => {
  setTimeout(() => {
    document.getElementById("loader").classList.add("hidden");
    // Check if already registered
    const saved = localStorage.getItem("brewmind_user");
    if (saved) {
      const u = JSON.parse(saved);
      state.userId   = u.userId;
      state.userName = u.name;
      state.weather  = u.weather || "normal";
      applyUser();
    } else {
      document.getElementById("onboardingOverlay").style.display = "flex";
    }
  }, 2000);
});

/* ───────────────────── ONBOARDING ───────────────────── */
// Weather chip selection
document.querySelectorAll(".weather-chips .chip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".weather-chips .chip").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.weather = btn.dataset.weather;
  });
});

// Mood chip selection (onboarding)
document.querySelectorAll(".mood-chips .chip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mood-chips .chip").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.mood = btn.dataset.mood;
  });
});

document.getElementById("startBtn").addEventListener("click", async () => {
  const nameInput = document.getElementById("userName").value.trim();
  state.userName  = nameInput || "Guest";
  state.userId    = uid();

  try {
    await fetch(`${API}/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: state.userName, userId: state.userId }),
    });
  } catch(e) {}

  localStorage.setItem("brewmind_user", JSON.stringify({
    userId: state.userId, name: state.userName, weather: state.weather,
  }));

  document.getElementById("onboardingOverlay").style.display = "none";
  applyUser();
});

/* ───────────────────── APPLY USER ───────────────────── */
async function applyUser() {
  document.getElementById("headerUserName").textContent = state.userName;
  document.getElementById("mainHeader").style.display = "";
  await loadMenu();
  await loadRecommendations();
  updateHeroQueue();
  updateHeroContext();
}

/* ───────────────────── MENU ───────────────────── */
async function loadMenu() {
  try {
    const res  = await fetch(`${API}/menu`);
    const data = await res.json();
    state.menu       = data.menu;
    state.categories = ["All", ...data.categories];
    renderCategoryFilters();
    renderMenu(state.menu);
  } catch(e) {
    toast("Failed to load menu", "error");
  }
}

function renderCategoryFilters() {
  const wrap = document.getElementById("categoryFilters");
  wrap.innerHTML = state.categories.map((cat, i) =>
    `<button class="filter-btn ${i === 0 ? "active" : ""}" data-cat="${cat}">${cat}</button>`
  ).join("");

  wrap.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      wrap.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const cat  = btn.dataset.cat;
      const term = document.getElementById("menuSearch").value.toLowerCase();
      filterMenu(cat, term);
    });
  });
}

function filterMenu(cat = "All", term = "") {
  let items = state.menu;
  if (cat !== "All") items = items.filter(i => i.category === cat);
  if (term)         items = items.filter(i =>
    i.name.toLowerCase().includes(term) || i.tags.some(t => t.includes(term))
  );
  renderMenu(items);
}

function renderMenu(items) {
  const grid = document.getElementById("menuGrid");
  if (!items.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:2rem">No items found ☕</div>`;
    return;
  }
  grid.innerHTML = items.map(item => menuCardHTML(item, false)).join("");
  grid.querySelectorAll(".add-btn").forEach(btn => {
    btn.addEventListener("click", () => addToCart(Number(btn.dataset.id)));
  });
}

function menuCardHTML(item, isAI = false) {
  const stars = "★".repeat(Math.round(item.rating)) + "☆".repeat(5 - Math.round(item.rating));
  return `
  <div class="menu-card">
    ${isAI ? `<div class="ai-badge">AI Pick</div>` : ""}
    <div class="card-emoji">${item.emoji}</div>
    <div class="card-name">${item.name}</div>
    <div class="card-category">${item.category}</div>
    <div class="card-rating">${stars} ${item.rating}</div>
    <div class="card-tags">
      ${item.tags.slice(0, 3).map(t => `<span class="tag-pill">${t}</span>`).join("")}
    </div>
    <div class="card-footer">
      <div>
        <div class="card-price">${fmt(item.price)}</div>
        <div class="card-prep">⏱ ${item.prepTime} min</div>
      </div>
      <button class="add-btn" data-id="${item.id}" title="Add to cart">+</button>
    </div>
  </div>`;
}

/* ───────────────────── RECOMMENDATIONS ───────────────────── */
async function loadRecommendations() {
  try {
    const res  = await fetch(`${API}/recommendations/${state.userId}?weather=${state.weather}`);
    const data = await res.json();
    renderRecommendations(data.recommendations, data.timeOfDay);

    document.getElementById("recSubtitle").textContent =
      `Personalized for you · ${capitalize(data.timeOfDay)} picks · ${state.weather !== "normal" ? capitalize(state.weather) + " day" : ""}`;

    document.getElementById("heroInsight").textContent =
      data.recommendations[0]
        ? `Try the ${data.recommendations[0].name} today!`
        : "Explore our menu";

    document.getElementById("heroContext").textContent =
      capitalize(data.timeOfDay) + " pick-me-up";
  } catch(e) {}
}

function renderRecommendations(items, timeOfDay) {
  const grid = document.getElementById("recsGrid");
  grid.innerHTML = items.map(item => menuCardHTML(item, true)).join("");
  grid.querySelectorAll(".add-btn").forEach(btn => {
    btn.addEventListener("click", () => addToCart(Number(btn.dataset.id)));
  });
}

document.getElementById("refreshRecs").addEventListener("click", loadRecommendations);

/* ───────────────────── HERO ───────────────────── */
async function updateHeroQueue() {
  try {
    const res  = await fetch(`${API}/queue`);
    const data = await res.json();
    const q    = data.total;
    const el   = document.getElementById("heroQueue");
    if (q === 0)     el.textContent = "Kitchen free — instant pickup!";
    else if (q < 3)  el.textContent = `${q} order(s) ahead — ~${q * 3} min wait`;
    else             el.textContent = `Busy! ${q} orders — ~${q * 2} min`;
  } catch(e) {}
}

function updateHeroContext() {
  const hour = new Date().getHours();
  let ctx = "Perfect time for a drink!";
  if (hour >= 6  && hour < 11) ctx = "Morning coffee vibes ☀️";
  else if (hour >= 11 && hour < 14) ctx = "Lunchtime fuel ⚡";
  else if (hour >= 14 && hour < 17) ctx = "Afternoon refresh 🧊";
  else if (hour >= 17 && hour < 21) ctx = "Evening wind-down 🍵";
  else ctx = "Late night sip 🌙";
  document.getElementById("heroContext").textContent = ctx;
}

/* ───────────────────── CART ───────────────────── */
function addToCart(id) {
  const item = state.menu.find(m => m.id === id);
  if (!item) return;
  const existing = state.cart.find(c => c.id === id);
  if (existing) { existing.qty++; }
  else { state.cart.push({ ...item, qty: 1 }); }
  renderCart();
  toast(`${item.emoji} ${item.name} added!`, "success");
  estimateWait();
}

function removeFromCart(id) {
  const idx = state.cart.findIndex(c => c.id === id);
  if (idx === -1) return;
  if (state.cart[idx].qty > 1) { state.cart[idx].qty--; }
  else { state.cart.splice(idx, 1); }
  renderCart();
  estimateWait();
}

function renderCart() {
  const count = state.cart.reduce((s, i) => s + i.qty, 0);
  document.getElementById("cartCount").textContent = count;

  const body   = document.getElementById("cartBody");
  const footer = document.getElementById("cartFooter");

  if (!state.cart.length) {
    body.innerHTML = `
      <div class="empty-cart">
        <div class="empty-icon">🧺</div>
        <p>Your cart is empty</p>
        <button class="btn-ghost-sm" id="browseMenuBtn2">Browse Menu</button>
      </div>`;
    footer.style.display = "none";
    document.getElementById("browseMenuBtn2")?.addEventListener("click", () => {
      closeCart(); showPage("menu");
    });
    return;
  }

  const total = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
  body.innerHTML = state.cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-emoji">${item.emoji}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${fmt(item.price)} × ${item.qty} = ${fmt(item.price * item.qty)}</div>
      </div>
      <div class="qty-ctrl">
        <button class="qty-btn" data-action="dec" data-id="${item.id}">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" data-action="inc" data-id="${item.id}">+</button>
      </div>
    </div>`).join("");

  body.querySelectorAll(".qty-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      btn.dataset.action === "inc" ? addToCart(id) : removeFromCart(id);
    });
  });

  document.getElementById("cartTotal").textContent = fmt(total);
  footer.style.display = "flex";
}

async function estimateWait() {
  if (!state.cart.length) return;
  try {
    const res  = await fetch(`${API}/wait-estimate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: state.cart.map(i => ({ id: i.id, qty: i.qty })) }),
    });
    const data = await res.json();
    document.getElementById("cartWaitTime").textContent = `${data.estimatedWait} min`;
    document.getElementById("cartWaitTip").textContent  = data.tip;

    // Update menu page wait bar
    const waitBar = document.getElementById("waitBar");
    waitBar.style.display = "block";
    document.getElementById("waitBarText").textContent = `Est. wait: ${data.estimatedWait} min · ${data.queueLength} order(s) ahead`;
    document.getElementById("waitBarTip").textContent  = data.tip;
  } catch(e) {}
}

// Cart open/close
document.getElementById("cartToggle").addEventListener("click", () => {
  document.getElementById("cartDrawer").classList.add("open");
  document.getElementById("cartOverlay").classList.add("open");
});
function closeCart() {
  document.getElementById("cartDrawer").classList.remove("open");
  document.getElementById("cartOverlay").classList.remove("open");
}
document.getElementById("cartClose").addEventListener("click", closeCart);
document.getElementById("cartOverlay").addEventListener("click", closeCart);
document.getElementById("browseMenuBtn")?.addEventListener("click", () => {
  closeCart(); showPage("menu");
});

/* ───────────────────── PLACE ORDER ───────────────────── */
document.getElementById("placeOrderBtn").addEventListener("click", async () => {
  if (!state.cart.length) return;

  const btn = document.getElementById("placeOrderBtn");
  btn.disabled = true; btn.textContent = "Placing order…";

  try {
    const res  = await fetch(`${API}/order`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: state.userId,
        customerName: state.userName,
        items: state.cart.map(i => ({ id: i.id, qty: i.qty })),
      }),
    });
    const data = await res.json();
    state.lastOrderId = data.order.id;

    closeCart();

    // Success modal
    document.getElementById("successMsg").textContent = `Order placed successfully!`;
    document.getElementById("successDetails").innerHTML = `
      <p>🆔 Order ID: <strong>${data.order.id}</strong></p>
      <p>⏱ Est. Wait: <strong>${data.waitInfo.estimatedWait} min</strong></p>
      <p>💰 Total: <strong>${fmt(data.order.total)}</strong></p>
      <p>${data.waitInfo.tip}</p>`;

    document.getElementById("successOverlay").classList.remove("hidden");

    state.cart = [];
    renderCart();
    updateHeroQueue();
    loadRecommendations();
  } catch(e) {
    toast("Failed to place order. Try again!", "error");
  } finally {
    btn.disabled = false; btn.textContent = "Place Order";
  }
});

// Success modal buttons
document.getElementById("successTrackBtn").addEventListener("click", () => {
  document.getElementById("successOverlay").classList.add("hidden");
  document.getElementById("trackOrderId").value = state.lastOrderId || "";
  showPage("track");
  if (state.lastOrderId) trackOrder(state.lastOrderId);
});
document.getElementById("successCloseBtn").addEventListener("click", () => {
  document.getElementById("successOverlay").classList.add("hidden");
});

/* ───────────────────── TRACK ORDER ───────────────────── */
async function trackOrder(id) {
  if (!id) return;
  try {
    const res  = await fetch(`${API}/order/${id}`);
    if (!res.ok) { toast("Order not found", "error"); return; }
    const o = await res.json();

    document.getElementById("trackResult").style.display = "block";
    document.getElementById("trackOid").textContent   = o.id;
    document.getElementById("trackName").textContent  = o.customerName;
    document.getElementById("trackItems").textContent = o.items.map(i => `${i.emoji}${i.name}×${i.qty}`).join(", ");
    document.getElementById("trackTotal").textContent = fmt(o.total);
    document.getElementById("trackWait").textContent  = `${o.estimatedWait} min`;
    document.getElementById("trackRemaining").textContent = o.remainingMinutes > 0
      ? `${o.remainingMinutes} min`
      : "Ready!";

    // Status badge
    const badge = document.getElementById("trackStatus");
    badge.textContent  = o.status.charAt(0).toUpperCase() + o.status.slice(1);
    badge.className    = `status-badge ${o.status}`;

    // Step indicators
    ["pending","preparing","ready"].forEach(step => {
      const el = document.getElementById(`step-${step}`);
      el.classList.remove("done","active");
    });
    const statusOrder = ["pending","preparing","ready"];
    const idx = statusOrder.indexOf(o.status);
    statusOrder.forEach((step, i) => {
      const el = document.getElementById(`step-${step}`);
      if (i < idx) el.classList.add("done");
      else if (i === idx) el.classList.add("active");
    });

    // Progress ring
    const r   = 50;
    const circ = 2 * Math.PI * r;
    const pct  = o.estimatedWait > 0
      ? Math.min(1, o.elapsedMinutes / o.estimatedWait)
      : 1;
    const offset = circ * (1 - pct);
    const ring = document.getElementById("ringFill");
    ring.style.strokeDasharray  = circ;
    ring.style.strokeDashoffset = offset;
    document.getElementById("ringLabel").textContent =
      o.status === "ready" ? "🎉 Ready!" : `${o.remainingMinutes} min left`;
  } catch(e) {
    toast("Could not fetch order", "error");
  }
}

document.getElementById("trackBtn").addEventListener("click", () => {
  const id = document.getElementById("trackOrderId").value.trim().toUpperCase();
  if (!id) { toast("Please enter an Order ID", "warning"); return; }
  trackOrder(id);
});

document.getElementById("refreshTrack").addEventListener("click", () => {
  const id = document.getElementById("trackOid").textContent;
  if (id) trackOrder(id);
});

/* ───────────────────── QUEUE ───────────────────── */
async function loadQueue() {
  try {
    const res  = await fetch(`${API}/queue`);
    const data = await res.json();
    const list = document.getElementById("queueList");

    if (!data.queue.length) {
      list.innerHTML = `<p class="empty-queue">No active orders right now. Be the first! ☕</p>`;
      return;
    }
    list.innerHTML = data.queue.map(o => `
      <div class="queue-item">
        <div>
          <div class="queue-item-name">${o.id}</div>
          <div class="queue-item-status">${o.customerName} · ${o.items.length} item(s)</div>
        </div>
        <div>
          <span class="status-badge ${o.status}">${o.status}</span>
          <div style="font-size:.78rem;color:var(--text-muted);text-align:right;margin-top:.3rem">~${o.estimatedWait} min</div>
        </div>
      </div>`).join("");
  } catch(e) {}
}

/* ───────────────────── MOOD MODAL ───────────────────── */
document.getElementById("moodBtn").addEventListener("click", () => {
  document.getElementById("moodOverlay").classList.remove("hidden");
});

document.querySelectorAll(".mood-card").forEach(btn => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".mood-card").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const mood = btn.dataset.mood;
    state.mood = mood;

    try {
      const res  = await fetch(`${API}/mood`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: state.userId, mood }),
      });
      const data = await res.json();

      const recs   = document.getElementById("moodRecs");
      const result = document.getElementById("moodResults");
      result.classList.remove("hidden");

      recs.innerHTML = data.suggestions.map(item => `
        <div class="mood-rec-card" data-id="${item.id}">
          <span class="m-emoji">${item.emoji}</span>
          <div class="m-info">
            <div class="m-name">${item.name}</div>
            <div class="m-price">${fmt(item.price)}</div>
          </div>
        </div>`).join("");

      recs.querySelectorAll(".mood-rec-card").forEach(card => {
        card.addEventListener("click", () => {
          addToCart(Number(card.dataset.id));
          document.getElementById("moodOverlay").classList.add("hidden");
        });
      });
    } catch(e) {}
  });
});

// Close modals
document.querySelectorAll(".modal-close").forEach(btn => {
  btn.addEventListener("click", () => {
    document.getElementById(btn.dataset.modal).classList.add("hidden");
  });
});

/* ───────────────────── MENU SEARCH ───────────────────── */
document.getElementById("menuSearch").addEventListener("input", e => {
  const term = e.target.value.toLowerCase();
  const activeCat = document.querySelector(".filter-btn.active")?.dataset.cat || "All";
  filterMenu(activeCat, term);
});

/* ───────────────────── NAV ───────────────────── */
document.querySelectorAll(".nav-tab").forEach(btn => {
  btn.addEventListener("click", () => showPage(btn.dataset.page));
});
document.getElementById("heroOrderBtn").addEventListener("click", () => showPage("menu"));
document.getElementById("heroTrackBtn").addEventListener("click", () => showPage("track"));
document.getElementById("moodBtn").addEventListener("click", () => {
  document.getElementById("moodOverlay").classList.remove("hidden");
});

/* ───────────────────── AUTO REFRESH ───────────────────── */
setInterval(() => {
  if (state.currentPage === "track") loadQueue();
  updateHeroQueue();
}, 15000);

/* ───────────────────── HELPER ───────────────────── */
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
