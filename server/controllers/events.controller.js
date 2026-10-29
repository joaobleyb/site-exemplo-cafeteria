import { subscribeStaff } from '../services/events.service.js';

export function staffStream(req, res) {
  subscribeStaff(req, res);
}
