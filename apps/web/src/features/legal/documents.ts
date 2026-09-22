export const TERMS_VERSION = '1.0'
export const PRIVACY_VERSION = '1.0'

export type LegalSection = { id: string; title: string; content: string }

export type LegalDocument = {
  title: string
  version: string
  updatedAt: string
  sections: LegalSection[]
}

// Ported from the legacy app. Placeholders stay until a legal review replaces them.
export const termsOfUse: LegalDocument = {
  title: 'Termos de Uso',
  version: TERMS_VERSION,
  updatedAt: '2026-03-28',
  sections: [
    {
      id: 'aceitacao-dos-termos',
      title: '1. Aceitação dos Termos',
      content:
        'Ao criar uma conta ou utilizar o Bens Seguros, o usuário declara que leu, compreendeu e concorda com estes Termos de Uso. O uso continuado da plataforma após alterações constitui aceitação dos termos revisados.',
    },
    {
      id: 'descricao-do-servico',
      title: '2. Descrição do Serviço',
      content:
        'O Bens Seguros é uma plataforma SaaS (Software as a Service) de gestão para corretoras de seguros, oferecendo funcionalidades de gestão de propostas e apólices, controle de comissões, cadastro de clientes, atendimento multicanal, gestão de documentos, relatórios e assistência com inteligência artificial.',
    },
    {
      id: 'cadastro-e-conta',
      title: '3. Cadastro e Conta',
      content:
        'O usuário deve fornecer informações verdadeiras, atualizadas e completas. Cada organização (corretora) é identificada por CNPJ único. O usuário é responsável pela confidencialidade de suas credenciais de acesso. É proibido compartilhar credenciais ou permitir acesso de terceiros não autorizados. O Bens Seguros pode suspender contas com informações falsas ou incompletas.',
    },
    {
      id: 'planos-e-pagamento',
      title: '4. Planos e Pagamento',
      content:
        'A plataforma oferece planos gratuitos e pagos com diferentes limites de funcionalidades. A cobrança dos planos pagos é recorrente (mensal ou anual), conforme o plano contratado. Reajustes de preço serão comunicados com antecedência mínima de 30 (trinta) dias. O não pagamento após o vencimento poderá resultar em suspensão do acesso às funcionalidades do plano contratado. Não há reembolso proporcional em caso de cancelamento antes do fim do período contratado, salvo disposição legal em contrário.',
    },
    {
      id: 'obrigacoes-do-usuario',
      title: '5. Obrigações do Usuário',
      content:
        'O usuário compromete-se a utilizar a plataforma exclusivamente para fins lícitos e relacionados à atividade de corretagem de seguros, a não realizar engenharia reversa, a não utilizar ferramentas automatizadas sem autorização prévia, a respeitar os limites de uso do plano contratado, a manter seus dados cadastrais atualizados e a cumprir a legislação vigente, incluindo a LGPD, no tratamento de dados pessoais de seus clientes.',
    },
    {
      id: 'obrigacoes-da-plataforma',
      title: '6. Obrigações da Plataforma',
      content:
        'O Bens Seguros compromete-se a disponibilizar a plataforma de forma contínua, ressalvadas manutenções programadas e eventos de força maior, a realizar backups periódicos dos dados armazenados, a implementar medidas de segurança compatíveis com o estado da técnica, a oferecer suporte técnico nos canais disponibilizados e a comunicar incidentes de segurança que possam afetar dados pessoais, conforme exigido pela LGPD. A plataforma não garante disponibilidade ininterrupta.',
    },
    {
      id: 'propriedade-intelectual',
      title: '7. Propriedade Intelectual',
      content:
        'A plataforma Bens Seguros, incluindo seu código-fonte, design, marcas, logotipos e documentação, é propriedade exclusiva de [INSERIR RAZÃO SOCIAL]. Os dados inseridos pelo usuário e por sua organização permanecem de propriedade do usuário/organização. O usuário concede ao Bens Seguros uma licença limitada, não exclusiva e revogável para processar seus dados exclusivamente para a prestação do serviço.',
    },
    {
      id: 'dados-e-privacidade',
      title: '8. Dados e Privacidade',
      content:
        'O tratamento de dados pessoais realizado pelo Bens Seguros é regido pela Política de Privacidade, disponível em /privacy, que é parte integrante destes Termos de Uso. Ao aceitar estes Termos, o usuário declara ter lido e concordado também com a Política de Privacidade.',
    },
    {
      id: 'limitacao-de-responsabilidade',
      title: '9. Limitação de Responsabilidade',
      content:
        'O Bens Seguros não garante resultados específicos decorrentes do uso da plataforma. A responsabilidade do Bens Seguros por danos diretos está limitada ao valor total pago pelo usuário nos últimos 12 (doze) meses. O Bens Seguros não será responsável por danos indiretos, incidentais, consequenciais, lucros cessantes ou perda de dados, exceto nos casos previstos em lei.',
    },
    {
      id: 'suspensao-e-rescisao',
      title: '10. Suspensão e Rescisão',
      content:
        'O Bens Seguros poderá suspender ou encerrar a conta do usuário em caso de violação destes Termos. O usuário pode cancelar sua conta a qualquer momento. Após o cancelamento, os dados do usuário permanecerão acessíveis para exportação por 30 (trinta) dias, após os quais serão eliminados conforme a Política de Privacidade. Dados sujeitos a obrigação legal de retenção serão mantidos pelo prazo exigido por lei.',
    },
    {
      id: 'alteracoes-nos-termos',
      title: '11. Alterações nos Termos',
      content:
        'O Bens Seguros pode alterar estes Termos a qualquer momento. Alterações materiais serão comunicadas por email e por banner na plataforma com antecedência mínima de 15 (quinze) dias e exigirão re-aceite explícito do usuário para continuar utilizando a plataforma.',
    },
    {
      id: 'disposicoes-gerais',
      title: '12. Disposições Gerais',
      content:
        'Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de [INSERIR CIDADE/UF] para dirimir quaisquer controvérsias. A invalidade de qualquer cláusula não compromete as demais disposições destes Termos.',
    },
    {
      id: 'contato',
      title: '13. Contato',
      content:
        'Para dúvidas sobre estes Termos de Uso: email [INSERIR EMAIL], endereço [INSERIR ENDEREÇO COMPLETO].',
    },
  ],
}

export const privacyPolicy: LegalDocument = {
  title: 'Política de Privacidade',
  version: PRIVACY_VERSION,
  updatedAt: '2026-03-28',
  sections: [
    {
      id: 'introducao-e-compromisso',
      title: '1. Introdução e Compromisso',
      content:
        'O Bens Seguros, operado por [INSERIR RAZÃO SOCIAL], inscrita no CNPJ sob o nº [INSERIR CNPJ], com sede em [INSERIR ENDEREÇO], está comprometida com a proteção dos dados pessoais de seus usuários e dos clientes das corretoras que utilizam a plataforma. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos, compartilhamos e protegemos dados pessoais, em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD).',
    },
    {
      id: 'definicoes',
      title: '2. Definições',
      content:
        'Conforme a LGPD (Art. 5º): dados pessoais, dados pessoais sensíveis, titular, controlador, operador, ANPD e tratamento.',
    },
    {
      id: 'dados-que-coletamos',
      title: '3. Dados que Coletamos',
      content:
        'Cadastrais (nome, email, telefone, senha), empresariais (razão social, CNPJ), de uso (endereço IP, navegador), de clientes da corretora, financeiros e de comunicação.',
    },
    {
      id: 'bases-legais',
      title: '4. Bases Legais (LGPD Art. 7º)',
      content:
        'Consentimento, execução de contrato, obrigação legal e legítimo interesse, conforme a finalidade de cada tratamento.',
    },
    {
      id: 'finalidade-do-tratamento',
      title: '5. Finalidade do Tratamento',
      content:
        'Identificação e autenticação, multi-tenancy, segurança, gestão de seguros pelo usuário, cobrança dos planos e melhoria do produto.',
    },
    {
      id: 'modelo-controlador-operador',
      title: '6. Modelo Controlador/Operador',
      content:
        'O Bens Seguros é controlador dos dados de conta dos usuários e operador dos dados de clientes inseridos pela corretora, que permanece controladora desses dados.',
    },
    {
      id: 'compartilhamento-de-dados',
      title: '7. Compartilhamento de Dados',
      content:
        'Compartilhamos dados apenas com processadores de pagamento, provedores de infraestrutura, email transacional, provedores de IA e autoridades competentes. Nunca vendemos dados pessoais.',
    },
    {
      id: 'transferencia-internacional',
      title: '8. Transferência Internacional',
      content:
        'Quando um provedor está fora do Brasil, a transferência ocorre com garantias adequadas, conforme a LGPD (Art. 33).',
    },
    {
      id: 'seguranca-dos-dados',
      title: '9. Segurança dos Dados',
      content:
        'Criptografia em repouso e em trânsito, isolamento por organização, controle de acesso e cookies seguros.',
    },
    {
      id: 'retencao-e-eliminacao',
      title: '10. Retenção e Eliminação',
      content:
        'Dados de conta enquanto a conta está ativa, dados fiscais pelo prazo legal e logs pelo prazo de segurança. A exclusão segue a LGPD.',
    },
    {
      id: 'direitos-do-titular',
      title: '11. Direitos do Titular (LGPD Art. 18)',
      content:
        'Confirmação e acesso, correção, anonimização, portabilidade, eliminação, informação sobre compartilhamento e revogação do consentimento. Responderemos em até 15 (quinze) dias úteis.',
    },
    {
      id: 'cookies-e-tecnologias',
      title: '12. Cookies e Tecnologias',
      content:
        'Usamos cookies essenciais de sessão e funcionais de preferência. Não utilizamos cookies de terceiros para publicidade.',
    },
    {
      id: 'uso-de-inteligencia-artificial',
      title: '13. Uso de Inteligência Artificial',
      content:
        'A plataforma pode usar inteligência artificial para assistência. Dados pessoais identificáveis são redatados antes do envio a provedores, e nenhuma decisão automatizada dispensa supervisão humana.',
    },
    {
      id: 'dados-de-menores',
      title: '14. Dados de Menores',
      content:
        'O Bens Seguros é destinado a empresas e profissionais. Não coletamos intencionalmente dados pessoais de menores de 18 anos.',
    },
    {
      id: 'alteracoes-na-politica',
      title: '15. Alterações na Política',
      content:
        'Alterações materiais serão comunicadas com antecedência mínima de 15 (quinze) dias e exigirão re-aceite explícito.',
    },
    {
      id: 'encarregado-de-dados',
      title: '16. Encarregado de Dados (DPO)',
      content:
        'O encarregado de proteção de dados será indicado em [INSERIR NOME DO DPO], email [INSERIR EMAIL DO DPO].',
    },
    {
      id: 'contato-e-anpd',
      title: '17. Contato e ANPD',
      content:
        'Dúvidas sobre esta Política: [INSERIR EMAIL]. Reclamações também podem ser apresentadas à Autoridade Nacional de Proteção de Dados (ANPD).',
    },
  ],
}
