import express from 'express';
import type { ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env } from './config/env.js';
import { isEntityTooLarge, jsonApiErrorHandler } from './errors.js';
import { expandLoopbackOrigins } from './http/allowed-origins.js';
import { createChatRateLimiter } from './middleware/chat-rate-limit.js';
import { requireAllowedOrigin } from './middleware/require-allowed-origin.js';
import { createRequireAuth } from './middleware/require-auth.js';
import { securityHeaders } from './middleware/security-headers.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createChatRouter } from './routes/chat.routes.js';
import { createConversationsRouter } from './routes/conversations.routes.js';
import { createMemoriesRouter } from './routes/memories.routes.js';
import {
  authService,
  conversationHistoryService,
  conversationService,
  memoryService,
  sharedPool,
} from './services/container.js';
import {
  buildHealthReport,
  toPublicHealthReport,
} from './services/health.service.js';

const app = express();

if (env.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

const allowedOrigins = expandLoopbackOrigins(env.FRONTEND_ORIGIN);

app.use(securityHeaders());
app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
app.use(cookieParser());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  }),
);
app.use('/api', requireAllowedOrigin());

app.get('/health', async (_req, res) => {
  const report = await buildHealthReport(sharedPool);
  const statusCode = report.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(toPublicHealthReport(report));
});

const requireAuth = createRequireAuth(authService);

app.use('/api/auth', createAuthRouter(authService));
app.use(
  '/api/chat',
  requireAuth,
  createChatRateLimiter(),
  createChatRouter(conversationService),
);
app.use(
  '/api/conversations',
  requireAuth,
  createConversationsRouter(conversationHistoryService),
);

app.use('/api/memories', requireAuth, createMemoriesRouter(memoryService));

const jsonTooLargeHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (isEntityTooLarge(err)) {
    res.status(413).json({
      error: 'Le corps de la requête dépasse la taille maximale autorisée.',
    });
    return;
  }

  next(err);
};

app.use(jsonTooLargeHandler);
app.use(jsonApiErrorHandler);

export default app;
