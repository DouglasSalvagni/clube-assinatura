import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class CommercialMetricsService {
  constructor(private readonly dataSource: DataSource) {}

  async summary(unitId: string, days = 30) {
    const safeDays = Math.min(Math.max(Number(days) || 30, 1), 365);
    const [opportunityStatuses, precheckoutStatuses, webhookFailures, conversion, stageDurations] = await Promise.all([
      this.dataSource.query(
        `SELECT commercial_status AS status, COUNT(*)::int AS total
           FROM opportunities
          WHERE unit_id = $1 AND created_at >= now() - ($2 || ' days')::interval
          GROUP BY commercial_status`,
        [unitId, safeDays],
      ),
      this.dataSource.query(
        `SELECT status, COUNT(*)::int AS total
           FROM precheckout_sessions
          WHERE unit_id = $1 AND created_at >= now() - ($2 || ' days')::interval
          GROUP BY status`,
        [unitId, safeDays],
      ),
      this.dataSource.query(
        `SELECT status, COUNT(*)::int AS total
           FROM webhook_events
          WHERE unit_id = $1
            AND created_at >= now() - ($2 || ' days')::interval
            AND status IN ('FAILED', 'DEAD_LETTER')
          GROUP BY status`,
        [unitId, safeDays],
      ),
      this.dataSource.query(
        `SELECT
           COUNT(*) FILTER (WHERE won_at IS NOT NULL)::int AS converted,
           COUNT(*)::int AS total,
           COALESCE(AVG(EXTRACT(EPOCH FROM (won_at - created_at)))
             FILTER (WHERE won_at IS NOT NULL), 0)::float AS average_seconds
           FROM opportunities
          WHERE unit_id = $1 AND created_at >= now() - ($2 || ' days')::interval`,
        [unitId, safeDays],
      ),
      this.dataSource.query(
        `WITH ordered_events AS (
           SELECT
             metadata->>'opportunityId' AS opportunity_id,
             metadata->>'toStageId' AS stage_id,
             created_at,
             LEAD(created_at) OVER (
               PARTITION BY metadata->>'opportunityId'
               ORDER BY created_at
             ) AS next_at
           FROM lifecycle_events
           WHERE unit_id = $1
             AND type = 'opportunity.stage_changed'
             AND created_at >= now() - ($2 || ' days')::interval
         )
         SELECT
           stage_id,
           COUNT(*)::int AS transitions,
           COALESCE(AVG(EXTRACT(EPOCH FROM (next_at - created_at)))
             FILTER (WHERE next_at IS NOT NULL), 0)::float AS average_seconds
         FROM ordered_events
         WHERE stage_id IS NOT NULL
         GROUP BY stage_id`,
        [unitId, safeDays],
      ),
    ]);

    const conversionRow = conversion[0] || { converted: 0, total: 0, average_seconds: 0 };
    const total = Number(conversionRow.total || 0);
    const converted = Number(conversionRow.converted || 0);
    return {
      periodDays: safeDays,
      opportunitiesByStatus: this.toCountMap(opportunityStatuses),
      precheckoutsByStatus: this.toCountMap(precheckoutStatuses),
      webhookFailuresByStatus: this.toCountMap(webhookFailures),
      conversion: {
        converted,
        total,
        rate: total ? Number(((converted / total) * 100).toFixed(2)) : 0,
        averageSeconds: Number(conversionRow.average_seconds || 0),
      },
      stageDurations: stageDurations.map((row: any) => ({
        stageId: row.stage_id,
        transitions: Number(row.transitions || 0),
        averageSeconds: Number(row.average_seconds || 0),
      })),
    };
  }

  private toCountMap(rows: any[]) {
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.total || 0)]));
  }
}
