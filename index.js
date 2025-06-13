const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 3000;
require('dotenv').config()


app.use(cors());
app.use(express.json());




const uri = `mongodb+srv://${process.env.User_name}:${process.env.User_password}@cluster0.2qurhv0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

const marathonCollection = client.db("assignment-11-server").collection("marathon");
const applicationsCollection = client.db("assignment-11-server").collection("applications")


//marathon related api

// marathon all in home page

app.get('/marathon', async(req,res)=>{

  //this 4 line are new added line 
  const email = req.query.email;
  const query = {};
  if(email){
    query.email = email;
  }


        const cursor = marathonCollection.find(query); //query is new line
        const result = await cursor.toArray();
        res.send(result);
})

//marathon detailse page api

app.get('/marathon/:id',async(req,res)=>{
        const id = req.params.id;
        const query = {_id: new ObjectId(id)}
        const result = await marathonCollection.findOne(query);
        res.send(result)
})


app.post('/marathon',async(req,res)=>{
const marathon = req.body;
const result = await marathonCollection.insertOne(marathon);
res.send(result);
})


// update marathon

app.patch('/marathon/:id',async(req,res)=>{
  const id = req.params.id;
  const filter = {_id: new ObjectId(id)}
  const updateElement = {
    $set: {
      title : req.body.title,
      marathonDate: req.body.marathonDate,
    }
  } 

  const result = await marathonCollection.updateOne(filter, updateElement)
  res.send(result)

})



// application related api


app.get("/applications",async (req,res)=>{
        const email = req.query.email;
        const title = req.query.title

        const query ={}
        if(email) query.email = email;
        if(title) query.title = {$regex:title,$options:"i"}
        const result = await applicationsCollection.find(query).toArray()
        res.send(result)
})

app.post("/applications", async(req,res)=>{
        const application = req.body;
        const result = await applicationsCollection.insertOne(application);
        res.send(result);
})



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
//     await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})