import express from 'express';
import cors from 'cors';
import chatRouter from './routes/chat.routes.js';

const app = express();

app.use(express.json());
app.use(cors());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'stella-ai-backend',
  });
});

app.use('/api/chat', chatRouter);

export default app;
