# Undercut

Painel interativo de Fórmula 1: o campeonato em uma tela e o replay de cada corrida, volta a volta, com análise de estratégia.

Projeto de fã, **não oficial**, sem vínculo com a Fórmula 1, a FIA ou as equipes.

## O que tem

- **Temporada** (2023 a 2026): disputa do título, mapa das etapas, classificações, e uma linha do tempo que volta o campeonato para qualquer etapa.
- **Corrida** (replays de 2026): carros se movendo na pista, torre de posições, player por voltas com controle de velocidade, sem mostrar o resultado antes da hora.
- **História**: os acontecimentos da corrida em ordem, incluindo ultrapassagens deduzidas das trocas de posição.
- **Comparar**: dois pilotos frente a frente em distância, ritmo, setores e telemetria da melhor volta.
- **Estratégia**: pneus, pit stops, undercut e overcut.
- **E se?**: estimativa do efeito de mover uma parada. É uma simulação simples, com as premissas à vista; nunca um resultado oficial.
- **Análise**: posições volta a volta, consistência e ritmo por stint.

## Como rodar

Precisa do Node 23.6 ou mais novo (os scripts em TypeScript rodam direto, sem compilar).

```bash
npm --prefix web install
npm run dev
```

O site abre em `http://localhost:5173`.

Outros comandos:

```bash
npm test                          # testes da lógica
npm run build                     # versão de produção em web/dist
npm run ingest:season -- 2026     # atualiza o campeonato de um ano
npm run ingest:race -- 2026 21    # baixa o replay de uma etapa
npm run ingest:race -- 2026 all   # baixa todas as corridas que faltam
npm run ingest:race -- 2026 all --sprint            # as sprints
npm run ingest:timed -- 2026 all                    # as classificações
npm run ingest:timed -- 2026 20 --sessions=FP1,FP2,FP3   # treinos de uma etapa
node ingest/sectors.ts            # tempos de setor das sessões baixadas
```

## Como funciona

O navegador nunca chama as APIs de dados. Os scripts em `ingest/` buscam os dados, processam e gravam arquivos JSON em `web/public/data/`; o site só lê esses arquivos.

- `ingest/season.ts`: calendário, resultados e classificações (Jolpica).
- `ingest/timed.ts`: replay de treinos e classificações, onde vale a melhor volta e não a ordem de chegada.
- `ingest/race.ts`: replay de uma corrida ou sprint (OpenF1). A posição de cada carro vira "distância percorrida ao longo do traçado", o que deixa o arquivo pequeno e faz os carros seguirem as curvas.
- `web/src/lib/`: lógica pura, com testes: pontuação, leitura do replay e as análises (história, pits, simulação).
- `web/src/components/`: a interface, em React.

Os textos da interface ficam em `web/src/i18n/pt-BR.ts`.

## Dados

- [Jolpica](https://github.com/jolpica/jolpica-f1): resultados e classificações.
- [OpenF1](https://openf1.org): posições, voltas, pneus, pits e telemetria. O uso gratuito é para dados históricos e fins não comerciais.

Limites conhecidos: os dados aparecem cerca de 30 minutos depois do fim de cada sessão (não há ao vivo); a ordem no replay é a da pista, sem punições aplicadas depois; onde a fonte não tem sinal de posição, a posição na pista é estimada pelos tempos de volta e o site avisa.
