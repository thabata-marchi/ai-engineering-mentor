// ============================================================================
//  mentorServer — expõe o mentor como um SERVIDOR MCP (Etapa 9)
// ============================================================================
//
//  O QUE É ISSO?
//  Aqui a gente "embrulha" o mentor no protocolo MCP (Model Context Protocol),
//  o mesmo do Módulo 3 do curso. Assim, qualquer cliente compatível (o VSCode,
//  o Claude, um agente LangChain...) enxerga o mentor como um conjunto de
//  capacidades e pode acioná-lo sozinho.
//
//  O MCP tem TRÊS tipos de capacidade (e a gente expõe):
//    • TOOL      → uma AÇÃO que o modelo executa. Aqui: `perguntar` e, se houver
//                  perfil, `meu_progresso` (o que o aluno vem estudando).
//    • RESOURCE  → um DOCUMENTO/contexto que descreve o serviço. Aqui: `mentor://base`.
//    • PROMPT    → um TEMPLATE de instrução pronto. Aqui: `estudo-guiado`.
//
//  DECISÃO DE ARQUITETURA:
//  Esta função recebe o caso de uso `AnswerQuestion` PRONTO (injeção de
//  dependência). Ela não sabe montar embedder/store/LLM — só "traduz" o mentor
//  para o protocolo. Por isso dá pra testá-la com um mentor FALSO, sem rede.
// ============================================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { AnswerQuestion } from '../application/answerQuestion.ts';
import type { ProfilePort } from '../core/ports.ts';
import { MAX_QUESTION_LEN } from '../core/validation.ts';

export function createMentorMcpServer(useCase: AnswerQuestion, profile?: ProfilePort): McpServer {
  const server = new McpServer({ name: 'ai-engineering-mentor', version: '0.1.0' });

  // ---------- TOOL: perguntar ----------
  server.registerTool(
    'perguntar',
    {
      title: 'Perguntar ao mentor',
      description:
        'Faz uma pergunta ao mentor de programação. Ele responde ancorado na base ' +
        'de conhecimento (RAG), de forma socrática, e cita as fontes usadas.',
      inputSchema: {
        // Validação na borda (Etapa 12): recusa vazio e limita o tamanho — o zod
        // barra antes mesmo de chegar ao caso de uso, com mensagem clara.
        pergunta: z
          .string()
          .min(1, 'A pergunta não pode ser vazia.')
          .max(MAX_QUESTION_LEN, `Pergunta muito longa (máximo ${MAX_QUESTION_LEN} caracteres).`)
          .describe('A pergunta do aluno'),
        sessao: z
          .string()
          .max(200)
          .optional()
          .describe('Identificador da conversa, para o mentor lembrar dos turnos. Opcional.'),
      },
    },
    async ({ pergunta, sessao }) => {
      const answer = await useCase.execute(pergunta, sessao);
      const fontes = answer.sources
        .map((s, i) => `[${i + 1}] ${s.source} (chunk #${s.position})`)
        .join('\n');
      const texto = fontes ? `${answer.text}\n\n📚 Fontes:\n${fontes}` : answer.text;
      return { content: [{ type: 'text', text: texto }] };
    },
  );

  // ---------- TOOL: meu_progresso (só quando há perfil) ----------
  // Expõe a visão AGREGADA do estudo do aluno: quantas perguntas fez, quais
  // fontes mais tocou e as últimas dúvidas. É a segunda capacidade da Etapa 10.
  if (profile) {
    server.registerTool(
      'meu_progresso',
      {
        title: 'Meu progresso',
        description:
          'Mostra o perfil de aprendizado do aluno: total de perguntas, as fontes ' +
          'mais consultadas e as últimas dúvidas. Use o mesmo identificador de sessão.',
        inputSchema: {
          sessao: z
            .string()
            .optional()
            .describe('Identificador do aluno/conversa. Padrão: "default".'),
        },
      },
      async ({ sessao }) => {
        const resumo = await profile.summary(sessao ?? 'default');
        if (resumo.total === 0) {
          return { content: [{ type: 'text', text: 'Ainda não há estudos registrados nesta sessão.' }] };
        }
        const fontes = resumo.porFonte
          .map((f) => `- ${f.source}: ${f.count} vez(es)`)
          .join('\n');
        const ultimas = resumo.ultimas.map((q, i) => `${i + 1}. ${q}`).join('\n');
        const texto =
          `📈 Progresso do aluno\n\n` +
          `Perguntas feitas: ${resumo.total}\n\n` +
          `Fontes mais consultadas:\n${fontes}\n\n` +
          `Últimas perguntas:\n${ultimas}`;
        return { content: [{ type: 'text', text: texto }] };
      },
    );
  }

  // ---------- RESOURCE: descrição da base ----------
  // Dá contexto ao cliente/LLM sobre o que o mentor faz, sem precisar perguntar.
  server.registerResource(
    'base-conhecimento',
    'mentor://base',
    {
      title: 'Base de conhecimento do mentor',
      description: 'O que o mentor sabe e como usá-lo.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text:
            '# Mentor de Engenharia de Software\n\n' +
            'Respondo perguntas ancoradas numa base de conhecimento própria (RAG), ' +
            'de forma socrática (pergunta + dica) e citando as fontes.\n\n' +
            'Use a tool `perguntar` com a sua dúvida. Passe `sessao` para eu lembrar da conversa.',
        },
      ],
    }),
  );

  // ---------- PROMPT: estudo guiado ----------
  // Um "atalho" pronto: dado um tema, gera a instrução ideal para começar.
  server.registerPrompt(
    'estudo-guiado',
    {
      title: 'Estudo guiado',
      description: 'Gera uma instrução pronta para estudar um tema com o mentor.',
      argsSchema: { tema: z.string().describe('O tema que você quer estudar') },
    },
    ({ tema }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Quero estudar "${tema}". Use a tool "perguntar" e me conduza pelo método socrático, citando as fontes.`,
          },
        },
      ],
    }),
  );

  return server;
}
