# Seeds de testes

## Execução

```bash
npm run migration:run
npm run seed:test-users
npm run seed:commercial-feature
# ou ambos:
npm run seed:test-all
```

## Variáveis opcionais

- `SEED_TEST_PASSWORD`: senha padrão; default `Test1234!`.
- `SEED_TEST_EMAIL_DOMAIN`: domínio dos usuários; default `dna.test`.
- `SEED_RESET_PASSWORDS=true`: redefine a senha de usuários já existentes.
- `SEED_MATRIX_SLUG` e `SEED_BRANCH_SLUG`: slugs das sedes.
- `SEED_COMMERCIAL_UNIT_SLUG`: sede que recebe os cenários comerciais.
- `COMMERCIAL_V2_ENABLED_UNITS=*`: permite a feature no ambiente local.

Os seeds são idempotentes e podem ser executados novamente. Não use as credenciais padrão em produção.
