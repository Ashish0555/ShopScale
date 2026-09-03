# WebSocket Infrastructure

The backend attaches Socket.IO to the HTTP server with access-token
authentication. Connected users join their private user room and can subscribe
only to orders owned by that user. Order creation, cancellation, and state
transitions emit `order:updated` events to the authorized order and user rooms.
