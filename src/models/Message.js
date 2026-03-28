import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  source: {
    type: String,
    enum: ['telegram', 'email', 'meeting', 'notes'],
    required: true,
  },
  senderName: { type: String, default: 'Unknown' },
  content: { type: String, required: true },
  tags: [String],
  priority: {
    type: String,
    enum: ['High', 'Medium', 'Low'],
    default: 'Medium',
  },
  requirements: {
    functional: [String],
    non_functional: [String],
    actors: [String],
    features: [String],
  },
  processedAt: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.models.Message || mongoose.model('Message', MessageSchema);
