import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'local-development-secret-change-this-before-production-123456';

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'CUSTOMER'], default: 'CUSTOMER' }
}, { timestamps: true, toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = String(ret._id); delete ret._id; delete ret.__v; delete ret.password; return ret; } } });
const courtSchema = new mongoose.Schema({
  courtName: { type: String, required: true, trim: true }, description: { type: String, default: '' },
  rentalRate: { type: Number, required: true, min: 1 }, available: { type: Boolean, default: true }
}, { toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = String(ret._id); delete ret._id; delete ret.__v; return ret; } } });
const bookingSchema = new mongoose.Schema({
  customerId: { type: String, required: true }, customerName: { type: String, required: true },
  courtId: { type: String, required: true }, courtName: { type: String, required: true },
  reservationDate: { type: String, required: true }, startingTime: { type: String, required: true }, endingTime: { type: String, required: true },
  totalAmount: { type: Number, required: true }, bookingStatus: { type: String, default: 'PENDING' },
  paymentStatus: { type: String, default: 'UNPAID' }, dateCreated: { type: Date, default: Date.now }
}, { toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = String(ret._id); delete ret._id; delete ret.__v; return ret; } } });
const User = mongoose.model('User', userSchema);
const Court = mongoose.model('Court', courtSchema);
const Booking = mongoose.model('Booking', bookingSchema);
const safeUser = u => ({ id: String(u._id), fullName: u.fullName, email: u.email, role: u.role });
const makeToken = u => jwt.sign({ id: String(u._id), role: u.role }, JWT_SECRET, { expiresIn: '24h' });

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ message: 'Please log in to continue.' });
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: 'Account not found. Please log in again.' });
    req.user = user; next();
  } catch { return res.status(401).json({ message: 'Your session has expired. Please log in again.' }); }
}
const adminOnly = (req, res, next) => req.user?.role === 'ADMIN' ? next() : res.status(403).json({ message: 'Administrator access required.' });
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);

app.get('/api/health', (_req,res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
app.post('/api/auth/register', asyncRoute(async (req,res) => {
  const fullName = String(req.body.fullName || '').trim(); const email = String(req.body.email || '').trim().toLowerCase(); const password = String(req.body.password || '');
  if (!fullName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8) return res.status(400).json({ message: 'Enter a name, valid email, and password with at least 8 characters.' });
  if (await User.findOne({ email })) return res.status(400).json({ message: 'That email is already registered.' });
  const user = await User.create({ fullName, email, password: await bcrypt.hash(password, 12), role: 'CUSTOMER' });
  res.json({ token: makeToken(user), user: safeUser(user) });
}));
app.post('/api/auth/login', asyncRoute(async (req,res) => {
  const email = String(req.body.email || '').trim().toLowerCase(); const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password))) return res.status(401).json({ message: 'Incorrect email or password.' });
  res.json({ token: makeToken(user), user: safeUser(user) });
}));
app.get('/api/auth/me', auth, (req,res) => res.json(safeUser(req.user)));
app.get('/api/courts', auth, asyncRoute(async (_req,res) => res.json(await Court.find().sort({ courtName: 1 }))));
app.get('/api/bookings', auth, asyncRoute(async (req,res) => {
  const query = req.user.role === 'ADMIN' ? {} : { customerId: String(req.user._id) };
  res.json(await Booking.find(query).sort({ dateCreated: -1 }));
}));
app.post('/api/bookings', auth, asyncRoute(async (req,res) => {
  const { courtId, reservationDate, startingTime, endingTime } = req.body;
  const court = await Court.findById(courtId);
  if (!court || !court.available) return res.status(400).json({ message: 'This court is not currently available.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reservationDate || '') || !/^\d{2}:\d{2}$/.test(startingTime || '') || !/^\d{2}:\d{2}$/.test(endingTime || '')) return res.status(400).json({ message: 'Please check the reservation details and try again.' });
  const today = new Date(); today.setHours(0,0,0,0);
  const date = new Date(`${reservationDate}T00:00:00`);
  const start = Number(startingTime.slice(0,2))*60 + Number(startingTime.slice(3));
  const end = Number(endingTime.slice(0,2))*60 + Number(endingTime.slice(3));
  if (Number.isNaN(date.getTime()) || date < today || end <= start) return res.status(400).json({ message: 'Choose a valid future date and an ending time after the start time.' });
  if (start < 420 || end > 1320) return res.status(400).json({ message: 'Court hours are 7:00 AM to 10:00 PM.' });
  const minutes = end - start;
  if (minutes < 60) return res.status(400).json({ message: 'Reservations must be at least one hour.' });
  const existing = await Booking.find({ courtId: String(court._id), reservationDate, bookingStatus: { $ne: 'CANCELLED' } });
  if (existing.some(b => start < (Number(b.endingTime.slice(0,2))*60 + Number(b.endingTime.slice(3))) && end > (Number(b.startingTime.slice(0,2))*60 + Number(b.startingTime.slice(3))))) return res.status(409).json({ message: 'That court is already booked during the selected time.' });
  const booking = await Booking.create({ customerId: String(req.user._id), customerName: req.user.fullName, courtId: String(court._id), courtName: court.courtName, reservationDate, startingTime, endingTime, totalAmount: court.rentalRate * (minutes/60), bookingStatus: 'PENDING', paymentStatus: 'UNPAID' });
  res.json(booking);
}));
app.patch('/api/bookings/:id/cancel', auth, asyncRoute(async (req,res) => {
  const b = await Booking.findById(req.params.id); if (!b) return res.status(404).json({ message: 'Reservation not found.' });
  if (req.user.role !== 'ADMIN' && b.customerId !== String(req.user._id)) return res.status(403).json({ message: 'You cannot cancel this reservation.' });
  if (b.paymentStatus === 'PAID' || b.bookingStatus === 'CANCELLED') return res.status(400).json({ message: 'This reservation can no longer be cancelled here. Contact the administrator.' });
  b.bookingStatus = 'CANCELLED'; await b.save(); res.json(b);
}));
app.get('/api/admin/stats', auth, adminOnly, asyncRoute(async (_req,res) => {
  const [customers, courts, all] = await Promise.all([User.countDocuments({ role: 'CUSTOMER' }), Court.countDocuments(), Booking.find()]);
  res.json({ customers, courts, bookings: all.length, pending: all.filter(b=>b.bookingStatus==='PENDING').length, revenue: all.filter(b=>b.paymentStatus==='PAID').reduce((sum,b)=>sum+b.totalAmount,0) });
}));
app.get('/api/admin/users', auth, adminOnly, asyncRoute(async (_req,res) => res.json((await User.find({ role: 'CUSTOMER' })).map(safeUser))));
app.post('/api/admin/courts', auth, adminOnly, asyncRoute(async (req,res) => {
  const { courtName, description='', rentalRate, available=true } = req.body;
  if (!String(courtName||'').trim() || !(Number(rentalRate)>0)) return res.status(400).json({ message: 'Court name and a rental rate above zero are required.' });
  res.json(await Court.create({ courtName: String(courtName).trim(), description, rentalRate: Number(rentalRate), available: Boolean(available) }));
}));
app.put('/api/admin/courts/:id', auth, adminOnly, asyncRoute(async (req,res) => {
  const { courtName, description='', rentalRate, available=true } = req.body;
  if (!String(courtName||'').trim() || !(Number(rentalRate)>0)) return res.status(400).json({ message: 'Court name and a rental rate above zero are required.' });
  const court = await Court.findByIdAndUpdate(req.params.id, { courtName: String(courtName).trim(), description, rentalRate: Number(rentalRate), available: Boolean(available) }, { new: true, runValidators: true });
  if (!court) return res.status(404).json({ message: 'Court not found.' }); res.json(court);
}));
app.delete('/api/admin/courts/:id', auth, adminOnly, asyncRoute(async (req,res) => {
  const court = await Court.findById(req.params.id); if (!court) return res.status(404).json({ message: 'Court not found.' });
  if (await Booking.exists({ courtId: String(court._id), bookingStatus: { $ne: 'CANCELLED' } })) return res.status(400).json({ message: 'This court has booking history and cannot be deleted. Mark it unavailable instead.' });
  await court.deleteOne(); res.json({ message: 'Court deleted.' });
}));
app.patch('/api/admin/bookings/:id', auth, adminOnly, asyncRoute(async (req,res) => {
  const b = await Booking.findById(req.params.id); if (!b) return res.status(404).json({ message: 'Booking not found.' });
  const validBooking = ['PENDING','APPROVED','CANCELLED','COMPLETED']; const validPayment = ['UNPAID','PAID','REFUNDED'];
  if (req.body.bookingStatus && validBooking.includes(req.body.bookingStatus)) b.bookingStatus = req.body.bookingStatus;
  if (req.body.paymentStatus && validPayment.includes(req.body.paymentStatus)) b.paymentStatus = req.body.paymentStatus;
  await b.save(); res.json(b);
}));
app.use((err,_req,res,_next) => { console.error(err); if (err?.code === 11000) return res.status(400).json({ message: 'That email is already registered.' }); res.status(500).json({ message: 'Server error. Please try again.' }); });

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pickleball_db');
console.log('Connected to MongoDB');
if (!(await User.exists({ email: 'admin@pickleball.local' }))) await User.create({ fullName: 'System Administrator', email: 'admin@pickleball.local', password: await bcrypt.hash('Admin123!', 12), role: 'ADMIN' });
if (await Court.countDocuments() === 0) await Court.insertMany([
  { courtName: 'Court 1', description: 'Indoor court with comfortable lighting.', rentalRate: 350, available: true },
  { courtName: 'Court 2', description: 'Outdoor court for casual and competitive play.', rentalRate: 300, available: true }
]);
app.listen(PORT, () => console.log(`Courtly API running at http://localhost:${PORT}`));
