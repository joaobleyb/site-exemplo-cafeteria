const staffClients = new Set();
const orderClients = new Map();

function write(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function open(req, res) {
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
}

export function subscribeStaff(req, res) {
  open(req, res);
  staffClients.add(res);
  write(res, 'ready', { at: Date.now() });
  req.on('close', () => staffClients.delete(res));
}

export function subscribeOrder(req, res, token, snapshot) {
  open(req, res);
  let set = orderClients.get(token);
  if (!set) orderClients.set(token, (set = new Set()));
  set.add(res);
  write(res, 'order', snapshot);
  req.on('close', () => {
    set.delete(res);
    if (!set.size) orderClients.delete(token);
  });
}

export function publishStaff(event, data) {
  for (const res of staffClients) write(res, event, data);
}

export function publishOrder(token, data) {
  const set = orderClients.get(token);
  if (set) for (const res of set) write(res, 'order', data);
}

setInterval(() => {
  for (const res of staffClients) res.write(': ping\n\n');
  for (const set of orderClients.values()) for (const res of set) res.write(': ping\n\n');
}, 25000).unref();
