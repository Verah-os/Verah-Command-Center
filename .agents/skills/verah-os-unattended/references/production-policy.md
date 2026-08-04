# Production policy

Production is outside VERAH OS Core. Never connect, deploy, migrate, repair,
seed, query customer data, change integrations or enable a production deploy.
Use local or ephemeral infrastructure and synthetic fixtures only.

If completion depends on production evidence, leave the implementation in a
draft PR, set the issue to blocked and report the minimum separate human action
required. Do not store tokens, project identifiers, private URLs, dumps or
customer data in repository artifacts.
