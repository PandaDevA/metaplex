import { ApolloServer } from "apollo-server-express";
import { ApolloServerPluginDrainHttpServer } from "apollo-server-core";
import express from "express";
import { createServer } from "http";
import { SubscriptionServer } from "subscriptions-transport-ws";
import { Context } from "../types/context";
import logger from "../logger";
import { MetaplexApiDataSource } from "../api";
import { execute, subscribe } from "graphql";
import { schema, context } from "./graphqlConfig";

export async function getServer(api: MetaplexApiDataSource<Context>) {
  const app = express();
  const httpServer = createServer(app);

  const apolloServer = new ApolloServer({
    schema,
    context,
    dataSources: () => ({ api }),
    introspection: true,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              subscriptionServer.close();
            },
          };
        },
      },
    ],
  });

  const subscriptionServer = SubscriptionServer.create(
    {
      schema,
      execute,
      subscribe,
      onConnect(context: Context) {
        api.initContext(context);
        return context;
      },
    },
    { server: httpServer, path: apolloServer.graphqlPath }
  );

  await apolloServer.start();
  apolloServer.applyMiddleware({
    app,
    path: "/",
  });

  return { app, httpServer, apolloServer };
}

export async function startApolloServer(api: MetaplexApiDataSource<Context>) {
  const { httpServer, apolloServer } = await getServer(api);
  const PORT = process.env.PORT || 4000;

  await new Promise((resolve) =>
    httpServer.listen({ port: PORT }, resolve as any)
  );

  const URL_GRAPHQL = `http://localhost:${PORT}${apolloServer.graphqlPath}`;
  const URL_GRAPHQL_WS = `ws://localhost:${PORT}${apolloServer.graphqlPath}`;

  logger.info(`🚀 Server ready at ${URL_GRAPHQL}`);
  logger.info(`🚀 Subscription ready at ${URL_GRAPHQL_WS}`);
}
