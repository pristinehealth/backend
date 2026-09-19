import mongoose from 'mongoose';

// Named atomic counters (e.g. "jobRef") for human-friendly sequential numbers.
// Each document is one sequence: _id is the sequence name, seq its current value.
interface CounterDocument {
    _id: string; // sequence name (e.g. "jobRef")
    seq: number;
}

const CounterSchema = new mongoose.Schema<CounterDocument>({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
});

const Counter = (mongoose.models.Counter as mongoose.Model<CounterDocument>)
    || mongoose.model<CounterDocument>('Counter', CounterSchema);

/** Atomically increment and return the next value for a named sequence. */
export async function getNextSequence(name: string): Promise<number> {
    const doc = await Counter.findByIdAndUpdate(
        name,
        { $inc: { seq: 1 } },
        { new: true, upsert: true },
    ).lean<CounterDocument>();
    return doc!.seq;
}

export default Counter;
