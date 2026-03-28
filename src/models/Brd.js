import mongoose from 'mongoose';

const BrdSchema = new mongoose.Schema({
  title: { type: String, required: true },
  projectName: String,
  version: { type: String, default: '1.0' },
  content: {
    executive_summary: String,
    project_scope: String,
    functional_requirements: [{
      id: String,
      description: String,
      priority: String,
      category: String,
    }],
    non_functional_requirements: [{
      id: String,
      description: String,
      priority: String,
    }],
    actors: [{ name: String, description: String }],
    moscow: {
      must_have: [String],
      should_have: [String],
      could_have: [String],
      wont_have: [String],
    },
    assumptions: [String],
    constraints: [String],
    acceptance_criteria: [String],
  },
  status: {
    type: String,
    enum: ['draft', 'review', 'approved'],
    default: 'draft',
  },
  rawText: String,
  messageIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
}, { timestamps: true });

export default mongoose.models.Brd || mongoose.model('Brd', BrdSchema);
