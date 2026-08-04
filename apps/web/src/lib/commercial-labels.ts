export const commercialStatusLabels: Record<string, string> = {
  DRAFT: 'Rascunho',
  NEGOTIATION: 'Em negociação',
  PENDING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovada',
  CHECKOUT_SENT: 'Checkout enviado',
  CONVERTED: 'Convertida',
  LOST: 'Perdida',
};

export const offerStatusLabels: Record<string, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicada',
  ARCHIVED: 'Revogada',
};

export const offerVersionStatusLabels: Record<string, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Vigente',
  RETIRED: 'Histórica',
};

export const billingCycleLabels: Record<string, string> = {
  MONTHLY: 'Mensal',
  YEARLY: 'Anual',
  QUARTERLY: 'Trimestral',
  SEMIANNUALLY: 'Semestral',
};

export const billingTypeLabels: Record<string, string> = {
  CREDIT_CARD: 'Cartão de crédito',
  BOLETO: 'Boleto',
  PIX: 'Pix',
};

export const customerTypeLabels: Record<string, string> = {
  PERSON: 'Pessoa física',
  COMPANY: 'Pessoa jurídica',
  ALL: 'Pessoa física e jurídica',
};

export const unitRoleLabels: Record<string, string> = {
  OWNER: 'Proprietário da sede',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  SALES: 'Negociador / Comercial',
  FINANCE: 'Financeiro',
  SUPPORT: 'Suporte',
  VIEWER: 'Somente leitura',
};
