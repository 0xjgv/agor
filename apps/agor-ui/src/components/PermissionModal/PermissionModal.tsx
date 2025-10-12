/**
 * PermissionModal Component
 *
 * Displays permission prompts from Claude Agent SDK PreToolUse hooks.
 * User can approve/deny with options to remember the decision.
 */

import type { PermissionRequest } from '@agor/core/permissions';
import { Button, Modal, Space, Typography } from 'antd';

const { Text, Title } = Typography;

export interface PermissionModalProps {
  request: PermissionRequest | null;
  onDecide: (allow: boolean, remember: boolean, scope: 'once' | 'session' | 'project') => void;
  onCancel: () => void;
}

export function PermissionModal({ request, onDecide, onCancel }: PermissionModalProps) {
  if (!request) return null;

  return (
    <Modal
      open={!!request}
      title="🛡️ Permission Required"
      onCancel={onCancel}
      footer={null}
      width={600}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Session info */}
        <Text type="secondary">Session: {request.sessionId.slice(0, 8)}</Text>

        {/* Tool name */}
        <div>
          <Title level={4} style={{ marginBottom: 8 }}>
            {request.toolName}
          </Title>
          <Text type="secondary">Claude wants to use this tool</Text>
        </div>

        {/* Tool input (formatted nicely) */}
        <div
          style={{
            background: '#1e1e1e',
            padding: 12,
            borderRadius: 4,
            maxHeight: 300,
            overflow: 'auto',
          }}
        >
          <pre style={{ margin: 0, fontSize: 12, color: '#d4d4d4' }}>
            {JSON.stringify(request.toolInput, null, 2)}
          </pre>
        </div>

        {/* Action buttons */}
        <Space style={{ width: '100%', justifyContent: 'flex-end' }} size="middle">
          <Button danger onClick={() => onDecide(false, false, 'once')}>
            Deny
          </Button>
          <Button type="default" onClick={() => onDecide(true, true, 'session')}>
            Allow for Session
          </Button>
          <Button type="default" onClick={() => onDecide(true, true, 'project')}>
            Allow for Project
          </Button>
          <Button type="primary" onClick={() => onDecide(true, false, 'once')}>
            Allow Once
          </Button>
        </Space>
      </Space>
    </Modal>
  );
}
