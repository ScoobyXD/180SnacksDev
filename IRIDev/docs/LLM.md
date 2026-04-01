# IRIDev — 180 Snacks IRI

## Purpose of This Document
180 Snacks pays a lot of money to IRI to use their own Costco sales data.
However their system is really slow and people have better things to do than manual data entry work from IRI to 180's own internal systems. So we're going to automate it.


## Context
Every monday evening Costco updates the sales data of all active products with their respective vendors for the previous week. After that, probably everyone who works with Costco (or atleast with IRI) scrambles to ingest the data within their organization. So we need some automated script or use some kind of tool, maybe Playwright, maybe Appium, to do this for us. For 180 Snacks, the moment IRI updates this process needs to start extracting data to their respective Airtable bases and tables.

