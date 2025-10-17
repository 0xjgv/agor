/**
 * Modal for configuring zone settings (name, triggers, etc.)
 */

import { Alert, Input, Modal, Select, theme } from 'antd';
import { useEffect, useId, useState } from 'react';
import type { BoardObject } from '../../types';

interface ZoneConfigModalProps {
  open: boolean;
  onCancel: () => void;
  zoneName: string;
  objectId: string;
  onUpdate: (objectId: string, objectData: BoardObject) => void;
  zoneData: BoardObject;
}

export const ZoneConfigModal = ({
  open,
  onCancel,
  zoneName,
  objectId,
  onUpdate,
  zoneData,
}: ZoneConfigModalProps) => {
  const { token } = theme.useToken();
  const [name, setName] = useState(zoneName);
  const [triggerType, setTriggerType] = useState<'prompt' | 'task' | 'subtask'>('prompt');
  const [triggerText, setTriggerText] = useState('');
  const nameId = useId();
  const triggerTypeId = useId();
  const triggerTextId = useId();

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setName(zoneName);
    }
  }, [open, zoneName]);

  const handleSave = () => {
    // Only update if name changed (triggers are coming soon)
    if (name !== zoneName && zoneData.type === 'zone') {
      onUpdate(objectId, {
        ...zoneData,
        label: name,
      });
    }
    onCancel();
  };

  return (
    <Modal
      title="Configure Zone"
      open={open}
      onCancel={onCancel}
      onOk={handleSave}
      okText="Save"
      cancelText="Cancel"
      width={600}
    >
      {/* Zone Name */}
      <div style={{ marginBottom: 24 }}>
        <label
          htmlFor={nameId}
          style={{
            display: 'block',
            marginBottom: 8,
            fontWeight: 500,
            color: token.colorText,
          }}
        >
          Zone Name
        </label>
        <Input
          id={nameId}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Enter zone name..."
          size="large"
        />
      </div>

      <Alert
        message="Triggers - Coming Soon"
        description="Zone triggers will allow you to automatically execute actions when sessions are dropped into this zone. This feature is currently under development."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <div style={{ marginBottom: 16 }}>
        <label
          htmlFor={triggerTypeId}
          style={{
            display: 'block',
            marginBottom: 8,
            fontWeight: 500,
            color: token.colorText,
          }}
        >
          Trigger Type
        </label>
        <Select
          id={triggerTypeId}
          value={triggerType}
          onChange={setTriggerType}
          style={{ width: '100%' }}
          options={[
            { value: 'prompt', label: 'Prompt - Send a message to the session' },
            { value: 'task', label: 'Task - Create a new task' },
            { value: 'subtask', label: 'Subtask - Create a subtask for the session' },
          ]}
        />
      </div>

      <div>
        <label
          htmlFor={triggerTextId}
          style={{
            display: 'block',
            marginBottom: 8,
            fontWeight: 500,
            color: token.colorText,
          }}
        >
          Trigger
        </label>
        <Input.TextArea
          id={triggerTextId}
          value={triggerText}
          onChange={e => setTriggerText(e.target.value)}
          placeholder="Enter the prompt or task description that will be triggered..."
          rows={6}
        />
      </div>
    </Modal>
  );
};
