/**
 * React hook for Agor daemon client connection
 *
 * Manages FeathersJS client lifecycle with React effects
 */

import type { AgorClient } from '@agor/core/api';
import { createClient } from '@agor/core/api';
import { useEffect, useRef, useState } from 'react';

interface UseAgorClientResult {
  client: AgorClient | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

interface UseAgorClientOptions {
  url?: string;
  accessToken?: string | null;
  allowAnonymous?: boolean;
}

/**
 * Create and manage Agor daemon client connection
 *
 * @param options - Connection options (url, accessToken, allowAnonymous)
 * @returns Client instance, connection state, and error
 */
export function useAgorClient(options: UseAgorClientOptions = {}): UseAgorClientResult {
  const { url = 'http://localhost:3030', accessToken, allowAnonymous = false } = options;
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(!!accessToken || allowAnonymous); // Connecting if we have token OR anonymous is allowed
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<AgorClient | null>(null);

  useEffect(() => {
    let mounted = true;
    let client: AgorClient | null = null;

    async function connect() {
      // Don't create client if no access token and anonymous not allowed
      if (!accessToken && !allowAnonymous) {
        setConnecting(false);
        setConnected(false);
        setError(null);
        clientRef.current = null;
        return;
      }

      setConnecting(true);
      setError(null);

      // Create client (autoConnect: false, so we control connection timing)
      client = createClient(url, false);
      clientRef.current = client;

      // Setup socket event listeners BEFORE connecting
      client.io.on('connect', () => {
        if (mounted) {
          setConnected(true);
          setConnecting(false);
          setError(null);
        }
      });

      client.io.on('disconnect', () => {
        if (mounted) {
          setConnected(false);
        }
      });

      client.io.on('connect_error', (_err: Error) => {
        if (mounted) {
          setError('Daemon is not running. Start it with: cd apps/agor-daemon && pnpm dev');
          setConnecting(false);
          setConnected(false);
        }
      });

      // Now manually connect the socket
      client.io.connect();

      // Wait for connection before authenticating
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 5000);

          if (client.io.connected) {
            clearTimeout(timeout);
            resolve();
            return;
          }

          client.io.once('connect', () => {
            clearTimeout(timeout);
            resolve();
          });

          client.io.once('connect_error', err => {
            clearTimeout(timeout);
            reject(err);
          });
        });
      } catch (_err) {
        if (mounted) {
          setError('Failed to connect to daemon. Make sure it is running on :3030');
          setConnecting(false);
          setConnected(false);
        }
        return; // Exit early, don't try to authenticate
      }

      // Authenticate with JWT or anonymous
      try {
        if (accessToken) {
          // Authenticate with JWT token
          await client.authenticate({
            strategy: 'jwt',
            accessToken,
          });
        } else if (allowAnonymous) {
          // Authenticate anonymously
          await client.authenticate({
            strategy: 'anonymous',
          });
        }
      } catch (_err) {
        if (mounted) {
          setError(
            accessToken
              ? 'Authentication failed. Please log in again.'
              : 'Anonymous authentication failed. Check daemon configuration.'
          );
          setConnecting(false);
          setConnected(false);
        }
        return;
      }

      // Authentication successful - connection is ready
      if (mounted) {
        setConnected(true);
        setConnecting(false);
        setError(null);
      }
    }

    connect();

    // Cleanup on unmount
    return () => {
      mounted = false;
      if (client?.io) {
        // Remove all listeners to prevent memory leaks
        client.io.removeAllListeners();
        // Disconnect gracefully
        client.io.disconnect();
      }
    };
  }, [url, accessToken, allowAnonymous]);

  return {
    client: clientRef.current,
    connected,
    connecting,
    error,
  };
}
