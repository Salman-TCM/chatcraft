"""Celery tasks for flow execution (delay nodes, scheduled resumes)."""
import uuid

from app.workers.celery_app import celery_app


@celery_app.task(name="flow.resume_flow_run", bind=True, max_retries=3)
def resume_flow_run(self, run_id: str) -> None:
    """Resume a waiting FlowRun after a delay node timer expires."""
    import asyncio

    async def _resume() -> None:
        from app.db.session import AsyncSessionLocal
        from app.models.flow import Flow, FlowRun
        from app.services.flow.executor import FlowExecutor
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            run = await db.get(FlowRun, uuid.UUID(run_id))
            if not run or run.status != "waiting":
                return

            flow = await db.get(Flow, run.flow_id)
            if not flow:
                return

            executor = FlowExecutor(flow, run, db)
            # Advance past the delay node
            from app.services.flow.executor import _MAX_STEPS
            next_id = executor._next_node_id(run.current_node_id or "", "default")
            if next_id:
                run.current_node_id = next_id
            await executor.execute()

    asyncio.run(_resume())
