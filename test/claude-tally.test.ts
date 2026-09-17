import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lastTurnBilling } from '../src/claude/tally.js';

function userPrompt(text: string): string {
  return JSON.stringify({ type: 'user', uuid: `u-${text}`, message: { role: 'user', content: text } });
}

function transcript(lines: string[]): string {
  const path = join(mkdtempSync(join(tmpdir(), 'graft-billing-')), 'session.jsonl');
  writeFileSync(path, lines.join('\n') + '\n');
  return path;
}

function billed(
  uuid: string,
  msgId: string,
  part: unknown,
  usage: { input: number; cacheCreate: number; cacheRead: number },
  model = 'claude-opus-5',
): string {
  return JSON.stringify({
    type: 'assistant', uuid,
    message: {
      role: 'assistant', id: msgId, model, content: [part],
      usage: {
        input_tokens: usage.input,
        cache_creation_input_tokens: usage.cacheCreate,
        cache_read_input_tokens: usage.cacheRead,
        output_tokens: 100,
      },
    },
  });
}

test('lastTurnBilling: one API response split across lines is billed once', () => {
  const usage = { input: 10, cacheCreate: 1_000, cacheRead: 100_000 };
  const path = transcript([
    userPrompt('a question'),
    billed('a1', 'msg_1', { type: 'thinking', thinking: '...' }, usage),
    billed('a2', 'msg_1', { type: 'tool_use', name: 'Bash', input: {} }, usage),
  ]);
  const bill = lastTurnBilling(path)!;
  assert.equal(bill.uuid, 'a2');
  assert.equal(bill.tokens, 101_010);
  assert.equal(bill.costMicros, Math.round((10 + 1_250 + 10_000) * 5));
});

test('lastTurnBilling: distinct responses in one turn are summed', () => {
  const path = transcript([
    userPrompt('a question'),
    billed('a1', 'msg_1', { type: 'text', text: 'first' }, { input: 100, cacheCreate: 0, cacheRead: 0 }),
    billed('a2', 'msg_2', { type: 'text', text: 'second' }, { input: 200, cacheCreate: 0, cacheRead: 0 }),
  ]);
  assert.equal(lastTurnBilling(path)!.tokens, 300);
});

test('lastTurnBilling: the previous turn is not billed again', () => {
  const path = transcript([
    userPrompt('older question'),
    billed('a1', 'msg_1', { type: 'text', text: 'old' }, { input: 9_999, cacheCreate: 0, cacheRead: 0 }),
    userPrompt('current question'),
    billed('a2', 'msg_2', { type: 'text', text: 'new' }, { input: 100, cacheCreate: 0, cacheRead: 0 }),
  ]);
  assert.equal(lastTurnBilling(path)!.tokens, 100);
});

test('lastTurnBilling: an unpriced model is left out of the rate entirely', () => {
  const path = transcript([
    userPrompt('a question'),
    billed('a1', 'msg_1', { type: 'text', text: 'x' }, { input: 500, cacheCreate: 0, cacheRead: 0 }, 'some-future-model'),
    billed('a2', 'msg_2', { type: 'text', text: 'y' }, { input: 100, cacheCreate: 0, cacheRead: 0 }),
  ]);
  assert.equal(lastTurnBilling(path)!.tokens, 100);
});

test('lastTurnBilling: null when there is nothing to bill', () => {
  assert.equal(lastTurnBilling(undefined), null);
  assert.equal(lastTurnBilling('/no/such/file.jsonl'), null);
  const path = transcript([userPrompt('q'), JSON.stringify({ type: 'assistant', uuid: 'a1', message: { content: [{ type: 'text', text: 'reply' }] } })]);
  assert.equal(lastTurnBilling(path), null);
});
