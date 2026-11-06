import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LocalDateTime from "@/components/LocalDateTime";
import PageContainer from "@/components/PageContainer";
import { graphql } from "@/gql";
import { serverQuery } from "@/lib/graphql/server";
import AutoRefresh from "./AutoRefresh";
import CacheSection from "./CacheSection";
import { toCache, toDiscord, toGemini, toR2, toRedis } from "./data";
import DiscordSection from "./DiscordSection";
import GeminiSection from "./GeminiSection";
import R2Section from "./R2Section";
import RedisSection from "./RedisSection";

export const metadata: Metadata = { title: "System" };

const SystemRoleQuery = graphql(`
  query SystemRole {
    me {
      role
    }
  }
`);

const SystemStatusQuery = graphql(`
  query SystemStatus {
    systemStatus {
      generatedAt
      gemini {
        configured
        model
        fallbackModels
        requestsLastMinute
        tokensLastMinute
        rpmLimit
        tpmLimit
        rpdLimit
        today {
          day
          requests
          totalTokens
          promptTokens
          outputTokens
          errors
          rateLimited
          slipCalls
          statementCalls
        }
        history {
          day
          requests
          totalTokens
          errors
          rateLimited
        }
        log {
          at
          kind
          model
          ok
          status
          ms
          totalTokens
          error
        }
      }
      r2 {
        configured
        bucket
        usedBytes
        quotaBytes
        objectCount
        month
        classAOps
        classALimit
        classBOps
        classBLimit
      }
      redis {
        connected
        clientStatus
        pingMs
        error
        version
        mode
        uptimeSeconds
        connectedClients
        maxClients
        usedMemoryBytes
        peakMemoryBytes
        maxMemoryBytes
        maxMemoryPolicy
        opsPerSecond
        totalCommands
        keyspaceHits
        keyspaceMisses
        evictedKeys
        expiredKeys
        rejectedConnections
        totalKeys
        keysWithExpiry
        keyGroups {
          group
          count
        }
        keyGroupsTruncated
        events {
          at
          type
          message
        }
      }
      discord {
        publicKeySet
        botTokenSet
        applicationIdSet
        bot {
          ok
          checkedAt
          ms
          botUsername
          commands
          error
        }
        lastInteractionAt
        interactionsToday
        interactionErrorsToday
        invalidSignaturesToday
        dmsToday
        dmErrorsToday
        interactionLabels {
          label
          count
        }
        linkedUsers
        channels
        activeChannels
        sent24h
        failed24h
        pending24h
        recentFailures {
          at
          channelLabel
          eventType
          error
        }
      }
      cache {
        hitsToday
        missesToday
        groups {
          group
          hits
          misses
        }
        log {
          at
          key
          group
          hit
          ms
        }
      }
    }
  }
`);

/** Admin-only health + quota page. Non-admins get a 404 rather than a hint it exists. */
export default async function SystemPage() {
  const { me } = await serverQuery(SystemRoleQuery);
  if (me?.role !== "ADMIN") notFound();

  const { systemStatus } = await serverQuery(SystemStatusQuery);

  return (
    <PageContainer
      title="System"
      actions={
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            Updated <LocalDateTime iso={systemStatus?.generatedAt ?? ""} format="short" />
          </span>
          <AutoRefresh />
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GeminiSection gemini={toGemini(systemStatus?.gemini)} />
        <R2Section r2={toR2(systemStatus?.r2)} />
      </div>
      <DiscordSection discord={toDiscord(systemStatus?.discord)} />
      <RedisSection redis={toRedis(systemStatus?.redis)} />
      <CacheSection cache={toCache(systemStatus?.cache)} />
    </PageContainer>
  );
}
