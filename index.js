// index.js
const express = require('express');


const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;



// CORS - allow your dev frontend + production origin
app.use(cors({
  origin: ['http://localhost:5173'], // add production origin too when deployed
  credentials: true
}));
app.use(express.json());

// Firebase Admin init - put your firebase-adminsdk.json in server folder
const serviceAccount = require('./firebase-adminsdk.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// MongoDB client
const uri = `mongodb+srv://${process.env.User_name}:${process.env.User_password}@cluster0.2qurhv0.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

// Middleware: verify Firebase ID Token
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "Unauthorized access - missing token" });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded; // attach decoded token
    return next();
  } catch (err) {
    console.error('verifyIdToken error:', err);
    return res.status(401).json({ message: "Unauthorized access - invalid token" });
  }
};

// Middleware: verify email param matches decoded token email (case-insensitive)
const verifyEmailToken = (req, res, next) => {
  const queryEmail = (req.query.email || '').toLowerCase();
  const decodedEmail = (req.decoded?.email || '').toLowerCase();
  if (!queryEmail || queryEmail !== decodedEmail) {
    return res.status(403).json({ message: 'Forbidden: email mismatch' });
  }
  next();
};

async function run() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const marathonCollection = client.db("assignment-11-server").collection("marathon");
    const applicationsCollection = client.db("assignment-11-server").collection("applications");
    const collection = client.db("assignment-11-server").collection("userRunningData");

    // public endpoints
    app.get('/marathon', async (req, res) => {
      const result = await marathonCollection.find().sort({ createdAt: -1 }).toArray();
      res.json(result);
    });

    app.get('/marathon/latest', async (req, res) => {
      const result = await marathonCollection.find().sort({ createdAt: -1 }).limit(4).toArray();
      res.json(result);
    });

    //marathon details page
    app.get('/marathon/:id', async (req, res) => {
      const id = req.params.id;
      try {
        const marathon = await marathonCollection.findOne({ _id: new ObjectId(id) });
        if (!marathon) {
          return res.status(404).json({ message: "Marathon not found" });
        }
        res.json(marathon);
      } catch (error) {
        res.status(500).json({ message: "Server error", error });
      }
    });


    // protected route: my-marathon (requires token + email match)
    app.get('/my-marathon', verifyToken, verifyEmailToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) query.email = email;
      const result = await marathonCollection.find(query).toArray();
      res.json(result);
    });

    // CRUD for marathon (you can protect create/update/delete if desired)
    app.post('/marathon', verifyToken, async (req, res) => {
      // optional: require the user email to match req.decoded.email if you want only owners to create
      const marathon = req.body;
      const result = await marathonCollection.insertOne(marathon);
      res.json(result);
    });

    app.patch('/marathon/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateElement = { $set: req.body };
      const result = await marathonCollection.updateOne(filter, updateElement);
      res.json(result);
    });

    app.delete('/marathon/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await marathonCollection.deleteOne({ _id: new ObjectId(id) });
      res.json(result);
    });

    // applications endpoints (protected)
    app.get('/applications', verifyToken, verifyEmailToken, async (req, res) => {
      const email = req.query.email;
      const title = req.query.title;
      const query = {};
      if (email) query.email = email;
      if (title) query.title = { $regex: title, $options: 'i' };
      const result = await applicationsCollection.find(query).toArray();
      res.json(result);
    });

    app.post('/applications', async (req, res) => {
      const application = req.body;
      application.registerCount = 0;
      const result = await applicationsCollection.insertOne(application);
      // increment marathon registrationCount
      if (result.insertedId) {
        const marathonId = application.marathonID;
        if (marathonId) {
          await marathonCollection.updateOne(
            { _id: new ObjectId(marathonId) },
            { $inc: { registrationCount: 1 } }
          );
        }
      }
      res.json(result);
    });


    //daily user data share and update 




   app.patch('/running-data', async (req, res) => {
  try {
    const { userId, dailyData } = req.body;

    if (!userId || !dailyData) {
      return res.status(400).json({ error: 'User ID and daily data required' });
    }

    // Calculate speed on server side
    const calculatedData = dailyData.map(item => {
      const speed = item.time === 0 ? 0 : item.distance / (item.time / 60); // km/h
      return {
        day: item.day,
        distance: item.distance,
        time: item.time,
        speed,
        year: item.year,
        month: item.month,
      };
    });

    // Check if existing data for user
    const existingData = await collection.findOne({ userId });

    if (existingData) {
      const updatedDailyData = [...existingData.dailyData];

      // শুধু যেসব দিন আসছে সেগুলো replace করো
      calculatedData.forEach(newDay => {
        const index = updatedDailyData.findIndex(d => d.day === newDay.day);
        if (index > -1) {
          updatedDailyData[index] = newDay; // পুরোনো ডেটা replace
        } else {
          updatedDailyData.push(newDay); // নতুন দিন যোগ করো
        }
      });

      await collection.updateOne(
        { userId },
        { $set: { dailyData: updatedDailyData } }
      );

      return res.json({
        message: 'Data updated successfully',
        data: { userId, dailyData: updatedDailyData }
      });

    } else {
      // Insert new record
      const newData = { userId, dailyData: calculatedData };
      await collection.insertOne(newData);
      return res.status(201).json({
        message: 'Data saved successfully',
        data: newData
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server error' });
  }
});


  //get user all daily data

  app.get('/api/user-stats', async (req, res) => {
    try {
      const { userId } = req.query; // Frontend থেকে userId কুয়েরি প্যারামস দিয়ে আসবে

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const userData = await collection.findOne({ userId });

      if (!userData) {
        return res.status(404).json({ error: 'No data found for this user' });
      }

      // Lifetime distance
      const lifetime = userData.dailyData.reduce((sum, day) => sum + day.distance, 0);

      // Longest run
      const longestRun = Math.max(...userData.dailyData.map(day => day.distance));

      // Monthly data group by month
      const monthlyMap = {};
      userData.dailyData.forEach(day => {
        const monthName = new Date(day.year, day.month - 1).toLocaleString('default', { month: 'short' });
        monthlyMap[monthName] = (monthlyMap[monthName] || 0) + day.distance;
      });
      const monthlyData = Object.keys(monthlyMap).map(month => ({
        month,
        distance: monthlyMap[month]
      }));

      // Daily data (this month only)
      const currentMonth = new Date().getMonth() + 1;
      const dailyData = userData.dailyData.filter(day => day.month === currentMonth);

      res.json({
        lifetime,
        longestRun,
        monthlyData,
        dailyData
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  });





  // health
  app.get('/', (req, res) => res.send('Hello World!'));

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });

} catch (err) {
  console.error('Run error:', err);
}
}
run().catch(console.dir);
