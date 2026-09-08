# Repository Pattern

O padrão Repository abstrai o acesso ao banco de dados atrás de uma interface.
A aplicação fala com o repositório sem saber se por baixo existe Postgres, MongoDB
ou memória. Isso isola a persistência e facilita trocar a tecnologia de dados.
