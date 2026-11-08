export {};

declare global {
  namespace Express {
    interface Request {
      /** Identifiant utilisateur issu de la session, jamais du client. */
      userId?: string;
    }
  }
}
