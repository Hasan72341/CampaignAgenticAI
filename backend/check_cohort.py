import os
import requests
import json

base_url = "https://campaignx.inxiteout.ai"
api_key = os.environ.get("HACKATHON_API_KEY", "uXZZt27GczF-MJu3ZreoNPrt2ioPQ6sxFtIk10at25w") # From previous curl in context

headers = {"x-api-key": api_key}
print(f"Fetching cohort from {base_url}/api/v1/get_customer_cohort ...")
resp = requests.get(f"{base_url}/api/v1/get_customer_cohort", headers=headers)

if resp.status_code == 200:
    data = resp.json().get("data", [])
    print(f"Success! Fetched {len(data)} customers.")
    if data:
        print("First customer example:", json.dumps(data[0], indent=2))
else:
    print(f"Error {resp.status_code}: {resp.text}")
