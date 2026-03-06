import logging
logging.basicConfig(level=logging.INFO)

import uuid
from db.database import SessionLocal
from db.models import Campaign, CampaignStatus
from workflows.langgraph_flow import run_campaign_workflow

db = SessionLocal()
camp_id = str(uuid.uuid4())
c = Campaign(id=camp_id, brief="test brief", status=CampaignStatus.profiling)
db.add(c)
db.commit()

print("Running graph... ID:", camp_id)
try:
    run_campaign_workflow(campaign_id=camp_id, brief="test brief")
    print("Graph completed!")
except Exception as e:
    print("Graph Failed:", e)
