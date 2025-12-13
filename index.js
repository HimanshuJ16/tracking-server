require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 8080;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

// --- Middleware ---
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

// --- Socket.IO Setup ---
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("start_tracking", ({ bookingId }) => {
    if (bookingId) {
      console.log(`Client ${socket.id} is subscribing to trip: ${bookingId}`);
      socket.join(bookingId);
    }
  });

  socket.on("stop_tracking", ({ bookingId }) => {
    if (bookingId) {
      console.log(`Client ${socket.id} is unsubscribing from trip: ${bookingId}`);
      socket.leave(bookingId);
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });

  // --- NEW: Handle location updates directly via Socket ---
  socket.on("update_location", ({ tripId, bookingId, location }) => {
    if (tripId && location) {
      console.log(`[SOCKET_RX] Received location for trip ${tripId}${bookingId ? ` (Booking: ${bookingId})` : ""}:`, location);

      // 1. Broadcast to the room (users-website listening)
      // If bookingId is provided, use it (since website joins bookingId). Fallback to tripId.
      const roomId = bookingId || tripId;
      socket.to(roomId).emit("new_location", location);

      // 2. Save to database
      saveToDatabase(tripId, location);
    }
  });
});

// --- NEW HELPER FUNCTION ---
/**
 * Saves the location data to the main database API.
 * This is "fire-and-forget" so it doesn't slow down the broadcast.
 */
const saveToDatabase = async (tripId, location) => {
  try {
    const response = await fetch(`${CLIENT_URL}/api/trip/location?id=${tripId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(location),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`[DB_SAVE_ERROR] Failed to save location for trip ${tripId}:`, errorData);
    } else {
      console.log(`[DB_SAVE_SUCCESS] Saved location for trip ${tripId}`);
    }
  } catch (error) {
    console.error(`[DB_SAVE_ERROR] Error saving to database:`, error);
  }
};

// --- HTTP Route for React Native App ---
app.post("/broadcast/location", (req, res) => {
  try {
    const { tripId, location } = req.body;

    if (!tripId || !location) {
      return res.status(400).json({ success: false, error: "Missing tripId or location data" });
    }

    // 1. Broadcast the location to the specific trip room (INSTANT)
    io.to(tripId).emit("new_location", location);
    console.log(`[BROADCAST] Sent location for trip ${tripId}:`, location);

    // 2. Save to database in the background (FIRE-AND-FORGET)
    saveToDatabase(tripId, location);

    // Respond to the app immediately
    res.status(200).json({ success: true, message: "Location broadcasted" });

  } catch (error) {
    console.error("Error in /broadcast/location:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// --- Start Server ---
server.listen(PORT, () => {
  console.log(`Tracking server running on port ${PORT}`);
});