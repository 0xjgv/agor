// src/mocks/agents.ts
import type { Agent } from '../types';

export const mockAgentClaudecode: Agent = {
  id: 'claude-code',
  name: 'claude-code',
  icon: '🤖',
  installed: true,
  version: '1.2.3',
  description:
    'Anthropic Claude Code - AI-powered coding assistant with deep codebase understanding',
  installable: true,
};

export const mockAgentCodex: Agent = {
  id: 'codex',
  name: 'codex',
  icon: '💻',
  installed: false,
  version: '0.5.1',
  description: 'OpenAI Codex - Advanced code generation and completion (Coming Soon)',
  installable: false,
};

export const mockAgentCursor: Agent = {
  id: 'cursor',
  name: 'cursor',
  icon: '✏️',
  installed: false,
  description: 'Cursor AI - Intelligent code editor with AI pair programming (Coming Soon)',
  installable: false,
};

export const mockAgentGemini: Agent = {
  id: 'gemini',
  name: 'gemini',
  icon: '💎',
  installed: false,
  description: 'Google Gemini - Multimodal AI for code and data analysis (Coming Soon)',
  installable: false,
};

export const mockAgents: Agent[] = [
  mockAgentClaudecode,
  mockAgentCodex,
  mockAgentCursor,
  mockAgentGemini,
];

export const mockInstalledAgents = mockAgents.filter(agent => agent.installed);
export const mockNotInstalledAgents = mockAgents.filter(agent => !agent.installed);
