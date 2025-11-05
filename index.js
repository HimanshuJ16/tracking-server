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

// Enable CORS for web client
app.use(cors({
  origin: CLIENT_URL
}));

// Parse JSON bodies
app.use(express.json());

// --- Socket.IO Setup ---

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL, // Allow connections from your web app
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Web client subscribes to a trip
  socket.on("start_tracking", ({ bookingId }) => {
    if (bookingId) {
      console.log(`Client ${socket.id} is subscribing to trip: ${bookingId}`);
      socket.join(bookingId);
    }
  });

  // Web client unsubscribes
  socket.on("stop_tracking", ({ bookingId }) => {
     if (bookingId) {
      console.log(`Client ${socket.id} is unsubscribing from trip: ${bookingId}`);
      socket.leave(bookingId);
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// --- HTTP Route for React Native App ---

/**
 * This endpoint receives location updates from the mobile app.
 * It then broadcasts this location to all subscribed web clients.
 */
app.post("/broadcast/location", (req, res) => {
  try {
    const { tripId, location } = req.body;

    if (!tripId || !location) {
      return res.status(400).json({ success: false, error: "Missing tripId or location data" });
    }

    // Broadcast the location to the specific trip room
    io.to(tripId).emit("new_location", location);
    
    console.log(`Broadcasting location for trip ${tripId}:`, location);

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