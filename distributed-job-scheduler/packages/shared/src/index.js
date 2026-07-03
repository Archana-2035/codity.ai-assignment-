"use strict";
// ============================================================
// Shared TypeScript types for the Distributed Job Scheduler
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsEvent = exports.WorkflowStatus = exports.BatchStatus = exports.LogLevel = exports.RetryStrategy = exports.WorkerStatus = exports.ExecutionStatus = exports.JobStatus = exports.OrgRole = exports.UserRole = void 0;
// ─── Enums ───────────────────────────────────────────────────
var UserRole;
(function (UserRole) {
    UserRole["ADMIN"] = "admin";
    UserRole["MEMBER"] = "member";
})(UserRole || (exports.UserRole = UserRole = {}));
var OrgRole;
(function (OrgRole) {
    OrgRole["OWNER"] = "owner";
    OrgRole["ADMIN"] = "admin";
    OrgRole["MEMBER"] = "member";
})(OrgRole || (exports.OrgRole = OrgRole = {}));
var JobStatus;
(function (JobStatus) {
    JobStatus["PENDING"] = "pending";
    JobStatus["SCHEDULED"] = "scheduled";
    JobStatus["CLAIMED"] = "claimed";
    JobStatus["RUNNING"] = "running";
    JobStatus["COMPLETED"] = "completed";
    JobStatus["FAILED"] = "failed";
    JobStatus["DEAD"] = "dead";
    JobStatus["CANCELLED"] = "cancelled";
})(JobStatus || (exports.JobStatus = JobStatus = {}));
var ExecutionStatus;
(function (ExecutionStatus) {
    ExecutionStatus["RUNNING"] = "running";
    ExecutionStatus["COMPLETED"] = "completed";
    ExecutionStatus["FAILED"] = "failed";
})(ExecutionStatus || (exports.ExecutionStatus = ExecutionStatus = {}));
var WorkerStatus;
(function (WorkerStatus) {
    WorkerStatus["ACTIVE"] = "active";
    WorkerStatus["IDLE"] = "idle";
    WorkerStatus["DRAINING"] = "draining";
    WorkerStatus["OFFLINE"] = "offline";
})(WorkerStatus || (exports.WorkerStatus = WorkerStatus = {}));
var RetryStrategy;
(function (RetryStrategy) {
    RetryStrategy["FIXED"] = "fixed";
    RetryStrategy["LINEAR"] = "linear";
    RetryStrategy["EXPONENTIAL"] = "exponential";
})(RetryStrategy || (exports.RetryStrategy = RetryStrategy = {}));
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "debug";
    LogLevel["INFO"] = "info";
    LogLevel["WARN"] = "warn";
    LogLevel["ERROR"] = "error";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
var BatchStatus;
(function (BatchStatus) {
    BatchStatus["PENDING"] = "pending";
    BatchStatus["RUNNING"] = "running";
    BatchStatus["COMPLETED"] = "completed";
    BatchStatus["FAILED"] = "failed";
    BatchStatus["PARTIAL"] = "partial";
})(BatchStatus || (exports.BatchStatus = BatchStatus = {}));
var WorkflowStatus;
(function (WorkflowStatus) {
    WorkflowStatus["PENDING"] = "pending";
    WorkflowStatus["RUNNING"] = "running";
    WorkflowStatus["COMPLETED"] = "completed";
    WorkflowStatus["FAILED"] = "failed";
    WorkflowStatus["CANCELLED"] = "cancelled";
})(WorkflowStatus || (exports.WorkflowStatus = WorkflowStatus = {}));
// ─── WebSocket Event Types ────────────────────────────────────
var WsEvent;
(function (WsEvent) {
    WsEvent["JOB_STATUS_CHANGED"] = "job:status_changed";
    WsEvent["JOB_CREATED"] = "job:created";
    WsEvent["JOB_LOG"] = "job:log";
    WsEvent["WORKER_HEARTBEAT"] = "worker:heartbeat";
    WsEvent["WORKER_REGISTERED"] = "worker:registered";
    WsEvent["WORKER_OFFLINE"] = "worker:offline";
    WsEvent["QUEUE_STATS_UPDATED"] = "queue:stats_updated";
    WsEvent["QUEUE_PAUSED"] = "queue:paused";
    WsEvent["QUEUE_RESUMED"] = "queue:resumed";
    WsEvent["DLQ_ENTRY_CREATED"] = "dlq:entry_created";
})(WsEvent || (exports.WsEvent = WsEvent = {}));
