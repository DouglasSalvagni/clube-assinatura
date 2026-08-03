# Segurança

## Segredos

- Nunca versionar `.env`.
- `ENCRYPTION_KEY` deve conter 64 caracteres hexadecimais.
- Credenciais Asaas são criptografadas com AES-256-GCM.
- Tokens e chaves são removidos dos headers persistidos em webhooks.
- Logs não devem registrar payloads com credenciais ou documentos completos.

## Autorização

O administrador da instalação é uma função global e não pode ser concedido por rotas comuns de usuário. Usuários operacionais recebem um `Membership` por unidade e um papel local.

Toda consulta de negócio deve conter `unit_id` no predicado. Novos módulos devem usar `JwtAuthGuard`, `UnitAccessGuard`, `PermissionsGuard` e permissões explícitas.

## Produção

- Desabilitar `ASAAS_MOCK`.
- Usar TLS em web, API, PostgreSQL e Redis quando atravessarem redes não confiáveis.
- Restringir a API interna do worker à rede privada.
- Rotacionar JWT, token interno e credenciais Asaas periodicamente.
- Executar backup testado do PostgreSQL e do volume Redis.
- Aplicar rate limit no proxy e na API.
- Configurar CORS com origens exatas.
- Não publicar PostgreSQL e Redis diretamente na internet.

## LGPD

O banco armazena dados pessoais e financeiros. Recomenda-se:

- Política de retenção e descarte.
- Mascaramento em ambientes de homologação.
- Auditoria de exportações.
- Menor privilégio.
- Criptografia de backups.
- Procedimento de atendimento aos direitos do titular.
- Proibição de dumps reais dentro do repositório.
