/**
 * PermissionRequestBlock - Displays a permission request awaiting approval
 *
 * Shows:
 * - Tool name and description
 * - Tool input parameters in readable format
 * - Approve/Deny action buttons
 * - Visual indication that system is waiting
 */

import type { Task } from '@agor/core/types';
import { CheckOutlined, CloseOutlined, LockOutlined } from '@ant-design/icons';
import { Button, Card, Descriptions, Space, Tag, Typography, theme } from 'antd';
import type React from 'react';

const { Text, Title } = Typography;

interface PermissionRequestBlockProps {
  task: Task;
  isActive: boolean; // true if awaiting decision, false if approved/denied
  onApprove?: (taskId: string) => void;
  onDeny?: (taskId: string) => void;
}

export const PermissionRequestBlock: React.FC<PermissionRequestBlockProps> = ({
  task,
  isActive,
  onApprove,
  onDeny,
}) => {
  const { token } = theme.useToken();

  if (!task.permission_request) {
    return null;
  }

  const { tool_name, tool_input, requested_at, approved_by, approved_at } = task.permission_request;

  // Determine the state: active, approved, or denied
  // Note: Backend sets approved_by/approved_at for BOTH approve and deny decisions
  // We distinguish by task status: failed = denied, anything else = approved
  const isApproved = !isActive && approved_by && task.status !== 'failed';
  const isDenied = !isActive && approved_by && task.status === 'failed';

  // State-based styling
  const getStateStyle = () => {
    if (isActive) {
      return {
        background: 'rgba(255, 193, 7, 0.05)',
        border: `1px solid ${token.colorWarningBorder}`,
      };
    }
    if (isApproved) {
      return {
        background: 'rgba(82, 196, 26, 0.03)',
        border: `1px solid ${token.colorSuccessBorder}`,
      };
    }
    if (isDenied) {
      return {
        background: 'rgba(255, 77, 79, 0.03)',
        border: `1px solid ${token.colorErrorBorder}`,
      };
    }
    return {};
  };

  const getIcon = () => {
    if (isActive) return <LockOutlined style={{ fontSize: 20, color: token.colorWarning }} />;
    if (isApproved) return <CheckOutlined style={{ fontSize: 20, color: token.colorSuccess }} />;
    if (isDenied) return <CloseOutlined style={{ fontSize: 20, color: token.colorError }} />;
    return null;
  };

  const getTitle = () => {
    if (isActive) return 'Permission Required';
    if (isApproved) return 'Permission Approved';
    if (isDenied) return 'Permission Denied';
    return 'Permission Request';
  };

  const getSubtitle = () => {
    if (isActive) return 'The agent needs your approval to continue';
    if (isApproved && approved_at) {
      return `Approved ${new Date(approved_at).toLocaleString()}`;
    }
    if (isDenied && approved_at) {
      return `Denied ${new Date(approved_at).toLocaleString()}`;
    }
    return '';
  };

  return (
    <Card
      style={{
        marginTop: token.sizeUnit * 2,
        ...getStateStyle(),
      }}
      styles={{
        body: {
          padding: token.sizeUnit * 2,
        },
      }}
    >
      <Space direction="vertical" size={token.sizeUnit * 1.5} style={{ width: '100%' }}>
        {/* Header */}
        <Space size={token.sizeUnit}>
          {getIcon()}
          <div>
            <Title level={5} style={{ margin: 0 }}>
              {getTitle()}
            </Title>
            {getSubtitle() && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {getSubtitle()}
              </Text>
            )}
          </div>
        </Space>

        {/* Tool Details */}
        <div>
          <Space size={token.sizeUnit / 2}>
            <Text strong>Tool:</Text>
            <Tag color="blue">{tool_name}</Tag>
          </Space>
        </div>

        {/* Tool Input - show only if active or in detailed view */}
        {isActive && Object.keys(tool_input).length > 0 && (
          <div>
            <Text strong style={{ fontSize: 13 }}>
              Parameters:
            </Text>
            <Descriptions
              size="small"
              column={1}
              bordered
              style={{
                marginTop: token.sizeUnit,
              }}
              items={Object.entries(tool_input).map(([key, value]) => ({
                key,
                label: (
                  <Text code style={{ fontSize: 11 }}>
                    {key}
                  </Text>
                ),
                children: (
                  <Text
                    code
                    style={{ fontSize: 12, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
                  >
                    {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                  </Text>
                ),
              }))}
            />
          </div>
        )}

        {/* Timestamp - show only for active requests */}
        {isActive && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            Requested at {new Date(requested_at).toLocaleString()}
          </Text>
        )}

        {/* Action Buttons - show only when active */}
        {isActive && (
          <Space size={token.sizeUnit}>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              onClick={() => onApprove?.(task.task_id)}
              style={{ backgroundColor: token.colorSuccess }}
            >
              Approve
            </Button>
            <Button danger icon={<CloseOutlined />} onClick={() => onDeny?.(task.task_id)}>
              Deny
            </Button>
          </Space>
        )}
      </Space>
    </Card>
  );
};
