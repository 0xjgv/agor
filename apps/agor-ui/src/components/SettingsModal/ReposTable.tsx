import type { Repo } from '@agor/core/types';
import { BranchesOutlined, DeleteOutlined, FolderOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Checkbox,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Radio,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';

const { Text, Title } = Typography;

// Utility: Extract slug from Git URL (org/repo format)
function extractSlugFromUrl(url: string): string {
  try {
    // Remove .git suffix if present
    const cleanUrl = url.endsWith('.git') ? url.slice(0, -4) : url;

    // Handle SSH format: git@github.com:org/repo
    if (cleanUrl.includes('@')) {
      const match = cleanUrl.match(/:([^/]+\/[^/]+)$/);
      if (match) {
        return match[1];
      }
    }

    // Handle HTTPS format: https://github.com/org/repo
    const match = cleanUrl.match(/[:/]([^/]+\/[^/]+)$/);
    if (match) {
      return match[1];
    }

    // Fallback: use last two path segments
    const segments = cleanUrl.split('/').filter(Boolean);
    if (segments.length >= 2) {
      return `${segments[segments.length - 2]}/${segments[segments.length - 1]}`;
    }

    return '';
  } catch {
    return '';
  }
}

interface ReposTableProps {
  repos: Repo[];
  onCreate?: (data: { url: string; slug: string }) => void;
  onDelete?: (repoId: string) => void;
  onDeleteWorktree?: (repoId: string, worktreeName: string) => void;
  onCreateWorktree?: (
    repoId: string,
    data: {
      name: string;
      ref: string;
      createBranch: boolean;
      pullLatest?: boolean;
      sourceBranch?: string;
    }
  ) => void;
}

export const ReposTable: React.FC<ReposTableProps> = ({
  repos,
  onCreate,
  onDelete,
  onDeleteWorktree,
  onCreateWorktree,
}) => {
  const [createRepoModalOpen, setCreateRepoModalOpen] = useState(false);
  const [createWorktreeModalOpen, setCreateWorktreeModalOpen] = useState(false);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [repoForm] = Form.useForm();
  const [form] = Form.useForm();

  // Worktree form state
  const [useSameName, setUseSameName] = useState(true);
  const [strategy, setStrategy] = useState<'create' | 'checkout'>('create');
  const [pullLatest, setPullLatest] = useState(true);

  // Auto-extract slug when URL changes in repo form
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    if (url) {
      const slug = extractSlugFromUrl(url);
      if (slug) {
        repoForm.setFieldsValue({ slug });
      }
    }
  };

  const handleDeleteRepo = (repoId: string) => {
    onDelete?.(repoId);
  };

  const handleDeleteWorktree = (repoId: string, worktreeName: string) => {
    onDeleteWorktree?.(repoId, worktreeName);
  };

  const handleOpenCreateWorktree = (repoId: string, defaultBranch?: string) => {
    setSelectedRepoId(repoId);
    setUseSameName(true);
    setStrategy('create');
    setPullLatest(true);

    // Default to repo's default branch, fallback to main/master
    const baseBranch = defaultBranch || 'main';

    form.setFieldsValue({
      worktreeName: '',
      branchName: '',
      sourceBranch: baseBranch,
    });
    setCreateWorktreeModalOpen(true);
  };

  // Auto-sync branch name with worktree name when useSameName is checked
  const worktreeName = Form.useWatch('worktreeName', form);
  useEffect(() => {
    if (useSameName && worktreeName) {
      form.setFieldsValue({ branchName: worktreeName });
    }
  }, [worktreeName, useSameName, form]);

  // Auto-toggle pullLatest based on strategy
  useEffect(() => {
    if (strategy === 'create') {
      setPullLatest(true);
    } else if (strategy === 'checkout') {
      setPullLatest(false);
    }
  }, [strategy]);

  const handleCreateRepo = () => {
    repoForm.validateFields().then(values => {
      onCreate?.({
        url: values.url,
        slug: values.slug,
      });
      repoForm.resetFields();
      setCreateRepoModalOpen(false);
    });
  };

  const handleCreateWorktree = () => {
    if (!selectedRepoId) return;

    form.validateFields().then(values => {
      const worktreeName = values.worktreeName;
      const branchName = useSameName ? worktreeName : values.branchName;

      let ref: string;
      let createBranch: boolean;
      let sourceBranch: string | undefined;

      if (strategy === 'create') {
        // Creating a new branch
        ref = branchName;
        createBranch = true;
        sourceBranch = values.sourceBranch;
      } else {
        // Checking out existing ref (branch, tag, or commit)
        ref = branchName;
        createBranch = false;
      }

      onCreateWorktree?.(selectedRepoId, {
        name: worktreeName,
        ref,
        createBranch,
        pullLatest,
        sourceBranch,
      });
      form.resetFields();
      setCreateWorktreeModalOpen(false);
      setSelectedRepoId(null);
    });
  };

  return (
    <div style={{ padding: '0 24px' }}>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text type="secondary">Clone and manage git repositories for your sessions.</Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateRepoModalOpen(true)}>
          New Repository
        </Button>
      </div>

      {repos.length === 0 && (
        <Empty description="No repositories yet" style={{ marginTop: 32, marginBottom: 32 }}>
          <Text type="secondary">Click "New Repository" to clone a git repository.</Text>
        </Empty>
      )}

      {repos.length > 0 && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {repos.map(repo => (
            <Card
              key={repo.repo_id}
              size="small"
              title={
                <Space>
                  <FolderOutlined />
                  <Text strong>{repo.name}</Text>
                  {repo.managed_by_agor && (
                    <Tag color="blue" style={{ marginLeft: 8 }}>
                      Managed
                    </Tag>
                  )}
                </Space>
              }
              extra={
                <Popconfirm
                  title="Delete repository?"
                  description={
                    <>
                      <p>Are you sure you want to delete "{repo.name}"?</p>
                      {repo.managed_by_agor && (
                        <p style={{ color: '#ff4d4f' }}>
                          ⚠️ This will delete the local repository and all{' '}
                          {repo.worktrees?.length || 0} worktree(s).
                        </p>
                      )}
                    </>
                  }
                  onConfirm={() => handleDeleteRepo(repo.repo_id)}
                  okText="Delete"
                  cancelText="Cancel"
                  okButtonProps={{ danger: true }}
                >
                  <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                </Popconfirm>
              }
            >
              {/* Repo metadata */}
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Slug:{' '}
                  </Text>
                  <Text code style={{ fontSize: 12 }}>
                    {repo.slug}
                  </Text>
                </div>

                {repo.remote_url && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Remote:{' '}
                    </Text>
                    <Text code style={{ fontSize: 11 }}>
                      {repo.remote_url}
                    </Text>
                  </div>
                )}

                {/* Worktrees section */}
                <div style={{ marginTop: 12 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <Title level={5} style={{ marginBottom: 0, fontSize: 13 }}>
                      Worktrees ({repo.worktrees?.length || 0})
                    </Title>
                    <Button
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => handleOpenCreateWorktree(repo.repo_id, repo.default_branch)}
                    >
                      New Worktree
                    </Button>
                  </div>
                  {repo.worktrees && repo.worktrees.length > 0 && (
                    <List
                      size="small"
                      bordered
                      dataSource={repo.worktrees}
                      renderItem={worktree => (
                        <List.Item
                          actions={[
                            <Popconfirm
                              key="delete"
                              title="Delete worktree?"
                              description={
                                <>
                                  <p>Delete worktree "{worktree.name}"?</p>
                                  {worktree.sessions.length > 0 && (
                                    <p style={{ color: '#ff4d4f' }}>
                                      ⚠️ {worktree.sessions.length} session(s) reference this
                                      worktree.
                                    </p>
                                  )}
                                </>
                              }
                              onConfirm={() => handleDeleteWorktree(repo.repo_id, worktree.name)}
                              okText="Delete"
                              cancelText="Cancel"
                              okButtonProps={{ danger: true }}
                            >
                              <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                            </Popconfirm>,
                          ]}
                        >
                          <List.Item.Meta
                            avatar={<BranchesOutlined />}
                            title={
                              <Space>
                                <Text strong style={{ fontSize: 13 }}>
                                  {worktree.name}
                                </Text>
                                {worktree.new_branch && (
                                  <Tag color="green" style={{ fontSize: 11 }}>
                                    New Branch
                                  </Tag>
                                )}
                              </Space>
                            }
                            description={
                              <Space direction="vertical" size={2} style={{ fontSize: 12 }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  📍 {worktree.ref}
                                </Text>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  💬 {worktree.sessions.length}{' '}
                                  {worktree.sessions.length === 1 ? 'session' : 'sessions'}
                                </Text>
                              </Space>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  )}
                  {repo.worktrees && repo.worktrees.length === 0 && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      No worktrees yet
                    </Text>
                  )}
                </div>
              </Space>
            </Card>
          ))}
        </Space>
      )}

      {/* Create Repository Modal */}
      <Modal
        title="Clone Repository"
        open={createRepoModalOpen}
        onOk={handleCreateRepo}
        onCancel={() => {
          repoForm.resetFields();
          setCreateRepoModalOpen(false);
        }}
        okText="Clone"
      >
        <Form form={repoForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Repository URL"
            name="url"
            rules={[{ required: true, message: 'Please enter a git repository URL' }]}
            extra="HTTPS or SSH URL"
          >
            <Input
              placeholder="https://github.com/apache/superset.git"
              onChange={handleUrlChange}
            />
          </Form.Item>

          <Form.Item
            label="Repository Slug"
            name="slug"
            rules={[
              { required: true, message: 'Please enter a slug' },
              {
                pattern: /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/,
                message: 'Slug must be in org/repo format (e.g., apache/superset)',
              },
            ]}
            extra="Auto-detected from URL (editable). Format: org/repo"
          >
            <Input placeholder="apache/superset" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Create Worktree Modal */}
      <Modal
        title="Create Worktree"
        open={createWorktreeModalOpen}
        onOk={handleCreateWorktree}
        onCancel={() => {
          form.resetFields();
          setCreateWorktreeModalOpen(false);
          setSelectedRepoId(null);
        }}
        okText="Create"
        width={600}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Worktree Name"
            name="worktreeName"
            rules={[{ required: true, message: 'Please enter a worktree name' }]}
            extra="A descriptive name for this worktree"
          >
            <Input placeholder="feature-auth" />
          </Form.Item>

          <Form.Item>
            <Checkbox checked={useSameName} onChange={e => setUseSameName(e.target.checked)}>
              Use same name for git branch
            </Checkbox>
          </Form.Item>

          <Form.Item
            label="Branch Name"
            name="branchName"
            rules={[{ required: !useSameName, message: 'Please enter a branch name' }]}
          >
            <Input placeholder="feature-auth" disabled={useSameName} />
          </Form.Item>

          <Form.Item label="Branch Strategy">
            <Radio.Group value={strategy} onChange={e => setStrategy(e.target.value)}>
              <Space direction="vertical">
                <Radio value="create">Create new branch</Radio>
                <Radio value="checkout">Checkout existing branch/tag/commit</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          {strategy === 'create' && (
            <Form.Item
              label="Base Git Ref"
              name="sourceBranch"
              rules={[{ required: true, message: 'Please enter a git ref' }]}
              extra="Branch, tag, or commit to create from"
            >
              <Input placeholder="main" />
            </Form.Item>
          )}

          {strategy === 'create' && (
            <Form.Item>
              <Checkbox checked={pullLatest} onChange={e => setPullLatest(e.target.checked)}>
                Pull latest from remote before creating
              </Checkbox>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};
