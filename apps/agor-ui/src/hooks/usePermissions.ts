/**
 * usePermissions Hook
 *
 * Listens for permission requests from the daemon via WebSocket
 * and provides a method to send permission decisions back.
 */

import type { PermissionDecision, PermissionRequest } from '@agor/core/permissions';
import { useEffect, useState } from 'react';
import type { AgorClient } from '../types/client';

export function usePermissions(client: AgorClient | null) {
  const [pendingRequest, setPendingRequest] = useState<PermissionRequest | null>(null);

  useEffect(() => {
    if (!client) return;

    const handleRequest = (request: PermissionRequest) => {
      console.log('🛡️ Permission request received:', request);
      setPendingRequest(request);
    };

    // Listen for permission requests on sessions service
    client.service('sessions').on('permission:request', handleRequest);

    return () => {
      client.service('sessions').off('permission:request', handleRequest);
    };
  }, [client]);

  const sendDecision = async (
    allow: boolean,
    remember: boolean,
    scope: 'once' | 'session' | 'project'
  ) => {
    if (!pendingRequest || !client) return;

    const decision: PermissionDecision = {
      requestId: pendingRequest.requestId,
      allow,
      remember,
      scope,
      reason: allow ? undefined : 'User denied permission',
    };

    console.log('🛡️ Sending permission decision:', decision);

    // Send decision via custom endpoint
    // Note: We can't use the standard service methods here since this is a custom route
    await fetch(`http://localhost:3030/sessions/${pendingRequest.sessionId}/permission-decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(decision),
    });

    setPendingRequest(null);
  };

  const cancelRequest = () => {
    if (pendingRequest) {
      sendDecision(false, false, 'once');
    }
  };

  return { pendingRequest, sendDecision, cancelRequest };
}
