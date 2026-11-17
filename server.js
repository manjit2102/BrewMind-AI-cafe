const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ─────────────────────────────────────────────
//  IN-MEMORY DATA STORE
// ─────────────────────────────────────────────
const users = {}; // { userId: { name, history:[], preferences:{} } }
const orders = []; // live order queue
let orderIdCounter = 1;

// ─────────────────────────────────────────────
//  MENU
// ─────────────────────────────────────────────
const menu = [
  // Hot Drinks
  { id: 1, name: "Espresso",          category: "Hot Drinks",   price: 120, prepTime: 3,  tags: ["strong","coffee","classic"],        emoji: "☕", calories: 10,  rating: 4.8 },
  { id: 2, name: "Cappuccino",        category: "Hot Drinks",   price: 160, prepTime: 5,  tags: ["coffee","milk","frothy","classic"],  emoji: "☕", calories: 90,  rating: 4.7 },
  { id: 3, name: "Latte",            category: "Hot Drinks",   price: 170, prepTime: 5,  tags: ["coffee","milk","smooth","mild"],     emoji: "☕", calories: 120, rating: 4.6 },
  { id: 4, name: "Mocha",            category: "Hot Drinks",   price: 190, prepTime: 6,  tags: ["coffee","chocolate","sweet","rich"], emoji: "☕", calories: 200, rating: 4.5 },
  { id: 5, name: "Green Tea",        category: "Hot Drinks",   price: 100, prepTime: 3,  tags: ["tea","healthy","light","vegan"],     emoji: "🍵", calories: 5,   rating: 4.4 },
  { id: 6, name: "Masala Chai",      category: "Hot Drinks",   price: 90,  prepTime: 4,  tags: ["tea","spicy","milk","classic"],      emoji: "🍵", calories: 80,  rating: 4.9 },

  // Cold Drinks
  { id: 7, name: "Cold Brew",        category: "Cold Drinks",  price: 200, prepTime: 2,  tags: ["coffee","cold","strong","refreshing"],emoji: "🧊", calories: 15,  rating: 4.7 },
  { id: 8, name: "Iced Latte",       category: "Cold Drinks",  price: 190, prepTime: 3,  tags: ["coffee","cold","milk","smooth"],     emoji: "🧊", calories: 110, rating: 4.6 },
  { id: 9, name: "Mango Smoothie",   category: "Cold Drinks",  price: 180, prepTime: 4,  tags: ["fruit","sweet","cold","vegan"],      emoji: "🥭", calories: 160, rating: 4.5 },
  { id: 10, name: "Berry Blast",     category: "Cold Drinks",  price: 170, prepTime: 4,  tags: ["fruit","sweet","cold","healthy"],    emoji: "🫐", calories: 140, rating: 4.4 },

  // Snacks
  { id: 11, name: "Croissant",       category: "Snacks",       price: 120, prepTime: 1,  tags: ["pastry","buttery","classic","light"], emoji: "🥐", calories: 240, rating: 4.6 },
  { id: 12, name: "Avocado Toast",   category: "Snacks",       price: 220, prepTime: 5,  tags: ["healthy","vegan","savory","trendy"],  emoji: "🥑", calories: 280, rating: 4.5 },
  { id: 13, name: "Brownie",         category: "Snacks",       price: 110, prepTime: 1,  tags: ["sweet","chocolate","dessert"],        emoji: "🍫", calories: 310, rating: 4.7 },
  { id: 14, name: "Blueberry Muffin",category: "Snacks",       price: 100, prepTime: 1,  tags: ["sweet","pastry","light","classic"],   emoji: "🫐", calories: 220, rating: 4.4 },

  // Meals
  { id: 15, name: "Club Sandwich",   category: "Meals",        price: 280, prepTime: 8,  tags: ["savory","filling","classic"],         emoji: "🥪", calories: 420, rating: 4.5 },
  { id: 16, name: "Caesar Salad",    category: "Meals",        price: 240, prepTime: 6,  tags: ["healthy","light","fresh"],            emoji: "🥗", calories: 180, rating: 4.3 },
  { id: 17, name: "Pasta Primavera", category: "Meals",        price: 320, prepTime: 12, tags: ["savory","vegan","filling","hearty"],  emoji: "🍝", calories: 390, rating: 4.6 },
  { id: 18, name: "Veg Wrap",        category: "Meals",        price: 200, prepTime: 6,  tags: ["healthy","vegan","light","fresh"],    emoji: "🌯", calories: 310, rating: 4.4 },
];

// ─────────────────────────────────────────────
//  AI RECOMMENDATION ENGINE
// ─────────────────────────────────────────────
function getTimeContext() {
  const hour = new Date().getHours();
  if (hour >= 6  && hour < 11) return { time: "morning",   tags: ["coffee","tea","light","pastry","healthy"] };
  if (hour >= 11 && hour < 14) return { time: "lunch",     tags: ["filling","savory","meal","hearty"] };
  if (hour >= 14 && hour < 17) return { time: "afternoon", tags: ["cold","refreshing","sweet","snack"] };
  if (hour >= 17 && hour < 21) return { time: "evening",   tags: ["tea","snack","light","classic"] };
  return { time: "night", tags: ["light","herbal","mild"] };
}

function scoreItem(item, userPrefs, timeCtx, weather) {
  let score = 0;

  // Time-of-day boost
  const timeTags = timeCtx.tags;
  score += item.tags.filter(t => timeTags.includes(t)).length * 20;

  // User history preference boost
  if (userPrefs.favTags) {
    score += item.tags.filter(t => userPrefs.favTags.includes(t)).length * 30;
  }

  // Weather-based
  if (weather === "hot"  && item.tags.includes("cold"))    score += 25;
  if (weather === "cold" && item.tags.includes("classic")) score += 25;
  if (weather === "rainy"&& item.tags.includes("tea"))     score += 30;

  // Rating boost
  score += (item.rating - 4) * 15;

  // Prep-time bonus (faster = better score for quick recs)
  score += Math.max(0, 10 - item.prepTime) * 2;

  return score;
}

function getRecommendations(userId, weather = "normal", count = 6) {
  const user  = users[userId] || { preferences: {}, history: [] };
  const prefs = user.preferences || {};
  const timeCtx = getTimeContext();

  // Build fav tags from order history
  const favTags = {};
  (user.history || []).forEach(order => {
    order.items.forEach(item => {
      (item.tags || []).forEach(tag => {
        favTags[tag] = (favTags[tag] || 0) + 1;
      });
    });
  });
  prefs.favTags = Object.keys(favTags).sort((a, b) => favTags[b] - favTags[a]).slice(0, 5);

  const scored = menu
    .map(item => ({ ...item, score: scoreItem(item, prefs, timeCtx, weather) }))
    .sort((a, b) => b.score - a.score);

  return { recommendations: scored.slice(0, count), timeOfDay: timeCtx.time, prefs };
}

// ─────────────────────────────────────────────
//  WAIT TIME ENGINE
// ─────────────────────────────────────────────
function calculateWaitTime(cartItems) {
  const activeOrders = orders.filter(o => o.status === "preparing" || o.status === "pending");
  const queueLoad = activeOrders.length;

  // Max prep time among items + queue penalty
  const maxPrepTime = Math.max(...cartItems.map(i => i.prepTime || 5));
  const queuePenalty = queueLoad * 2; // 2 min per active order
  const totalWait = maxPrepTime + queuePenalty;

  // Suggest express items (prepTime <= 2)
  const expressItems = menu.filter(m => m.prepTime <= 2);

  return {
    estimatedWait: totalWait,
    queueLength: queueLoad,
    expressItems: expressItems.slice(0, 3),
    tip: totalWait > 15
      ? "High traffic! Add an express item to your order to get something instantly."
      : totalWait > 8
      ? "Moderate wait. We'll keep you updated via live status!"
      : "Great timing! Kitchen is free — your order will be ready super fast.",
  };
}

// ─────────────────────────────────────────────
//  ROUTES
// ─────────────────────────────────────────────

// GET  /api/menu
app.get("/api/menu", (req, res) => {
  const categories = [...new Set(menu.map(i => i.category))];
  res.json({ menu, categories });
});

// POST /api/register  { name, userId }
app.post("/api/register", (req, res) => {
  const { name, userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  if (!users[userId]) {
    users[userId] = { name: name || "Guest", history: [], preferences: {} };
  }
  res.json({ success: true, user: users[userId], message: `Welcome, ${users[userId].name}!` });
});

// GET  /api/recommendations/:userId?weather=hot
app.get("/api/recommendations/:userId", (req, res) => {
  const { userId } = req.params;
  const { weather } = req.query;
  const result = getRecommendations(userId, weather || "normal");
  res.json(result);
});

// POST /api/wait-estimate  { items:[{id,qty}] }
app.post("/api/wait-estimate", (req, res) => {
  const { items } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: "No items" });

  const resolved = items.map(ci => {
    const menuItem = menu.find(m => m.id === ci.id);
    return menuItem ? { ...menuItem, qty: ci.qty } : null;
  }).filter(Boolean);

  res.json(calculateWaitTime(resolved));
});

// POST /api/order  { userId, items:[{id,qty}], customerName }
app.post("/api/order", (req, res) => {
  const { userId, items, customerName } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: "Empty order" });

  const resolved = items.map(ci => {
    const menuItem = menu.find(m => m.id === ci.id);
    return menuItem ? { ...menuItem, qty: ci.qty } : null;
  }).filter(Boolean);

  if (!resolved.length) return res.status(400).json({ error: "Invalid items" });

  const waitInfo  = calculateWaitTime(resolved);
  const orderId   = `ORD${String(orderIdCounter++).padStart(4, "0")}`;
  const total     = resolved.reduce((s, i) => s + i.price * i.qty, 0);
  const placedAt  = new Date();

  const order = {
    id: orderId, userId, customerName: customerName || "Guest",
    items: resolved, total, status: "pending",
    estimatedWait: waitInfo.estimatedWait,
    placedAt, updatedAt: placedAt,
  };

  orders.push(order);

  // Update user history
  if (userId && users[userId]) {
    users[userId].history.push({ orderId, items: resolved, placedAt });
  }

  // Auto-advance order status (simulate kitchen)
  setTimeout(() => updateOrderStatus(orderId, "preparing"), 5000);
  setTimeout(() => updateOrderStatus(orderId, "ready"),     waitInfo.estimatedWait * 60 * 1000);

  res.json({
    success: true, order,
    waitInfo,
    message: `Order ${orderId} placed! Est. wait: ${waitInfo.estimatedWait} min`,
  });
});

// GET  /api/order/:orderId  — live status
app.get("/api/order/:orderId", (req, res) => {
  const order = orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });

  const elapsed   = Math.floor((Date.now() - new Date(order.placedAt)) / 60000);
  const remaining = Math.max(0, order.estimatedWait - elapsed);

  res.json({ ...order, elapsedMinutes: elapsed, remainingMinutes: remaining });
});

// GET  /api/orders/:userId  — history
app.get("/api/orders/:userId", (req, res) => {
  const user = users[req.params.userId];
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ history: user.history });
});

// GET  /api/queue  — kitchen view
app.get("/api/queue", (req, res) => {
  const active = orders.filter(o => o.status !== "ready" && o.status !== "cancelled");
  res.json({ queue: active, total: active.length });
});

// POST /api/mood  { userId, mood }  — mood-based personalisation
app.post("/api/mood", (req, res) => {
  const { userId, mood } = req.body;
  const moodMap = {
    energetic: ["strong","coffee","espresso"],
    relaxed:   ["tea","light","herbal","mild"],
    happy:     ["sweet","fruit","smoothie"],
    tired:     ["strong","coffee","espresso","classic"],
    healthy:   ["vegan","healthy","fresh","light"],
    indulgent: ["rich","chocolate","sweet","dessert"],
  };

  const tags = moodMap[mood] || [];
  const matched = menu
    .map(item => ({ ...item, score: item.tags.filter(t => tags.includes(t)).length }))
    .filter(i => i.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  res.json({ mood, suggestions: matched, tags });
});

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function updateOrderStatus(orderId, status) {
  const order = orders.find(o => o.id === orderId);
  if (order && order.status !== "ready") {
    order.status    = status;
    order.updatedAt = new Date();
  }
}

// Serve frontend (Express 5 requires named wildcard)
app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n☕  BrewMind AI Cafe is live at http://localhost:${PORT}\n`);
});
