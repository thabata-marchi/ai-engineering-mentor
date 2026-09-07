# Single Responsibility Principle (SRP)

Uma classe deve ter apenas um motivo para mudar. Quando uma classe acumula
várias responsabilidades, qualquer alteração em uma delas pode quebrar as outras.

## Exemplo

Uma classe `UserService` que cria usuário, envia e-mail e gera relatório está
fazendo coisas demais. Cada uma dessas tarefas deveria estar em sua própria
classe ou serviço, de modo que cada classe tenha uma única razão para mudar.
