import requests, os
api_key = 'uXZZt27GczF-MJu3ZreoNPrt2ioPQ6sxFtIk10at25w'
r = requests.get('https://campaignx.inxiteout.ai/api/v1/get_customer_cohort', headers={'x-api-key': api_key})
with open('cohort_result.txt', 'w') as f:
    f.write(str(len(r.json().get('data', []))))
