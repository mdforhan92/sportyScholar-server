const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();

const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);

// ! Middleware
app.use(cors());
app.use(express.json());



// ! verify Jwt token
const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ error: true, message: "Unauthorized access" });
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ error: true, message: "Forbidden access" });
        }
        req.decoded = decoded;
        next();
    });
}

// ! MongoDB Connection
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ptpa0yz.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 50,
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        client.connect((err => {
            if (err) {
                console.log(err);
                return;
            }
        }));
       const userCollection = client.db("sportyDb").collection("user");
        const classCollection = client.db("sportyDb").collection("classes");
        const selectedCollection = client.db("sportyDb").collection("selected");
        const enrolledCollection = client.db("sportyDb").collection("enrolled");



        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            // console.log(process.env.ACCESS_TOKEN_SECRET)
            res.send({ token })
        });

        // Warning: use verifyJWT before using verifyAdmin from db
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await userCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }
        // Warning: use verifyJWT before using verifyInstructor from db
        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await userCollection.findOne(query);
            if (user?.role !== 'instructor') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }


        //! users related apis
        app.get('/users',  async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });
        //storing user data in database
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);

            if (existingUser) {
                return res.send({ message: 'user already exists' })
            }

            const result = await userCollection.insertOne(user);
            res.send(result);
        });
        // get users by email
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const result = await userCollection.findOne(query);
            res.send(result);
        });
        // get admin users by email
        app.get('/users/admin/:email', verifyJWT,verifyAdmin, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await userCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        })
        // get Instructor users by email
        app.get('/users/instructor/:email', verifyJWT,verifyInstructor, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await userCollection.findOne(query);
            const result = { admin: user?.role === 'instructor' }
            res.send(result);
        })


        // setting  a user role to admin
        app.patch('/users/admin/:id',  async (req, res) => {
            const id = req.params.id;
            console.log(id);
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };

            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);

        });
        // setting  a user role to instructor
        app.patch('/users/instructor/:id', async (req, res) => {
            const id = req.params.id;
            console.log(id);
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'instructor'
                },
            };

            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);

        });

        // ! class related apis
        // for getting all the classes
        app.get('/classes',verifyJWT, verifyAdmin, async (req, res) => {
            const result = await classCollection.find().toArray();
            res.send(result);
        });
        // posting new class
        app.post('/classes', async (req, res) => {
            const classData = req.body;
            const result = await classCollection.insertOne(classData);
            res.send(result);
        });
        // show all the approved classes
        app.get('/approved-classes', async (req, res) => {
            const result = await classCollection.find({ status: 'approved' }).toArray();
            res.send(result);
        });

        // getting the first 6 popular classes sort by number of enrolled students
        app.get('/popular-classes', async (req, res) => {
            try {
                const popularClasses = await classCollection.find().sort({ numberOfStudents: -1 }).limit(6).toArray();
                res.send(popularClasses);
            } catch (err) {
                console.error(err);
                res.status(500).send('Internal server error');
            }
        });

        // get classes according to the instructor email
        app.get('/classes/:email',verifyJWT,verifyInstructor, async (req, res) => {
            const email = req.params.email;
            const result = await classCollection.find({ instructorEmail: email }).toArray();
            res.send(result);
        });
        // changing class  to approved put method
        app.put('/classes/approved/:id',verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'approved'
                },
            };
            const result = await classCollection.updateOne(filter, updateDoc);
            res.send(result);
        });
        // changing class to deny , put method
        app.put('/classes/denied/:id',verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'denied'
                },
            };
            const result = await classCollection.updateOne(filter, updateDoc);
            res.send(result);
        });
        // inserting feedback to a class
        app.put('/classes/feedback/:id',verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const feedback = req.body;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    feedback: feedback.inputValue
                },
            };
            const result = await classCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // ! selected classes related apis
        // post selected class to database
        app.post('/classes/selected', async (req, res) => {
            const selectedClass = req.body;
            const result = await selectedCollection.insertOne(selectedClass);
            res.send(result);
        });
        // get selected class by email
        app.get('/classes/selected/:email',verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { userEmail: email }
            const result = await selectedCollection.find(query).toArray();
            res.send(result);
        });
        // get selected class by id
        app.get('/classes/get/:id',async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await selectedCollection.findOne(query);
            res.send(result);
        });

        // deleting a selected class by id
        app.delete('/classes/selected/:id',verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await selectedCollection.deleteOne(query);
            res.send(result);
        });









        // ! instructor related apis
        // for getting all the instructors
     // get all instructors by role
    app.get('/instructors', async (req, res) => {
        const query = { role: 'instructor' }
        const result = await userCollection.find(query).toArray()
        res.send(result)
      })



        // getting the first 6 popular classes sort by number of class taken
        app.get('/instructors/popular', async (req, res) => {
            const pipeline = [
                {
                    $lookup: {
                        from: "classes",
                        localField: "email",
                        foreignField: "instructorEmail",
                        as: "classes",
                    },
                },
                {
                    $project: {
                        _id: 0,
                        name: 1,
                        photoURL: 1,
                        numberOfStudents: {
                            $cond: {
                                if: { $isArray: "$classes" },
                                then: { $sum: "$classes.numberOfStudents" },
                                else: 0,
                            },
                        },
                        numberOfClasses: {
                            $cond: {
                                if: { $isArray: "$classes" },
                                then: { $size: "$classes" },
                                else: 0,
                            },
                        },
                        classes: {
                            $cond: {
                                if: { $isArray: "$classes" },
                                then: { $arrayElemAt: ["$classes.name", 0] },
                                else: "",
                            },
                        },
                    },
                },
                { $sort: { numberOfStudents: -1 } },
                { $limit: 6 },
            ];

            const instructors = await userCollection.aggregate(pipeline).toArray();
            res.send(instructors);
        });
        

        //! create payment intent
        app.post('/create-payment-intent',verifyJWT, async (req, res) => {
            const { price } = req.body;

            const amount = parseInt(price * 100);
            console.log(price, amount)
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });

        });
        // to store payment info in enrolled and deleting the existing class from selected
        app.post('/enrolled',verifyJWT, async (req, res) => {
            try {
                const payment = req.body;
                const result = await enrolledCollection.insertOne(payment);

                // Delete the paid class data from the selected collection
                const { enrolledClass } = payment;
                const query = { _id: new ObjectId(enrolledClass._id) };
                const deleteResult = await selectedCollection.deleteOne(query);

                // Update the available seats in the classes collection
                const classQuery = { _id: new ObjectId(enrolledClass.classId) };
                const classUpdate = { $inc: { availableSeats: -1 } };
                const classUpdateResult = await classCollection.updateOne(classQuery, classUpdate);

                res.send({ paymentResult: result, deleteResult, classUpdateResult });
            } catch (error) {
                console.error('Error saving payment and deleting class data:', error);
                res.status(500).send('Failed to save payment and delete class data');
            }
        });
        // getting enrolled class by email
        app.get('/enrolled/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const result = await enrolledCollection.find(query).toArray();
            res.send(result);
        });



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('server is running')
})

app.listen(port, () => {
    console.log(`server is running on port ${port}`)
})