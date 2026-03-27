# Snap — 180 Snacks
## Background Info

180 Snacks is a medium sized snack manufacturing company that sell to large clients like Costco or TJX group.
In order to see what the market price for certain snacks for certain materials are, they like to send people to different retailers like Costco, Walmart, Marshalls, etc and take photos of the product, get some basic information like the name, price, weight, flavor, flavor description, etc and then upload that photo and data to their airtable. They do this manually.

## The Task
180 Snacks needs an app that can do this for them. So the workflow will be use a progressive web app like Kindle Store or IntoBible easily accessible on iOS or Android phone, walk into stores and take photos of products, everytime a photo is taken the backend extracts the information from the photo, then create a row in airtable with the columns filled out with the data and a photo of the product. Super simple stuff. Screenshots provided of exactly what this table looks like.

### UI Details
As soon as I open this app it should show the exact same ui and functionality as a regular smartphone camera. 
On the bottom right side should be a small box that has a name of user and underneath that, the name of the retail store.
So at the very first time ever user opens this app on their phone these fields are empty and so after tapping on each of the 2 box they can type and fill in the information. So whenever they take a photo with that information, those name and retail store name fields are automatically associated with the photo and appropriately put into airtable. But that information needs to be remembered. So after closing the browser or another day goes by, when you pop open the progressive web app, the user's name and the previous retailer's name is still there and remembered. So super simple stuff.



