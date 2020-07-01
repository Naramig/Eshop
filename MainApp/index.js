const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('pg');
const rp = require('request-promise');

const authUrl = 'http://localhost:8082';
const app = express();
app.use(bodyParser.json());

var env = process.env.NODE_ENV || 'development';
var config = require('./config')[env];
 
const client = new Client(config.database);
client.connect();
    
app.post('/signup', (req, res) => {
    var loginT=req.body.login;
    var passwordT=req.body.password;
    var options = {
      method: 'POST',
      uri: authUrl + '/signup',
      body: {
          login: loginT,
          password: passwordT
      },
      json: true
  };
  rp(options)
    .then(function (parsedBody) {
        res.send(parsedBody);
    })
    .catch(function (err) {
        res.status(err.statusCode).send(err.error);
    });
  
})

app.post('/signin', (req, res) => {
  var loginT=req.body.login;
  var passwordT=req.body.password;
  var options = {
    method: 'POST',
    uri: authUrl + 'signin',
    body: {
        login: loginT,
        password: passwordT
    },
    json: true
  };
  rp(options)
    .then(function (parsedBody) {
        res.send(parsedBody);
    })
    .catch(function (err) {
      res.status(err.statusCode).send(err.error);
    });
})

app.get('/getCategories', async (req, res) => {
  try{
    var categories = await client.query('SELECT * FROM "Category"');
    res.status(200).send(categories.rows);
  }catch(err){
    res.status(200).send({error: err.message});
  }
})

app.post('/createProduct', async (req, res) => {
  try{
    var category_id = req.body.category_id;
    var name = req.body.name;

    await client.query("INSERT INTO \"Product\" (name, category_id) VALUES ( $1, $2)", [name, category_id]);
    await client.query("UPDATE \"Category\" SET category_count = category_count + 1 WHERE id = $1", [category_id]);
    res.status(200).send("Inserted");
  }catch(err){
    res.status(400).send({error: err.message});
  }
})

app.post('/deleteProduct', async (req, res) => {
  try{
    var id = req.body.id;
    var category_id;

    var product = await client.query("SELECT * FROM \"Product\" WHERE id = $1", [id]);
    if(product.rows.length == 0){
      throw new Error('Product Not Found');
    }
    category_id = product.rows[0].category_id;

    await client.query("DELETE FROM \"Favorite\" WHERE product_id = $1", [id]);
    await client.query("DELETE FROM \"Product\" WHERE id = $1", [id]);
    await client.query("UPDATE \"Category\" SET  category_count =  category_count - 1 WHERE id = $1", [category_id]);
    res.status(200).send("Product Deleted");
  }catch(err){
    res.status(400).send({error: err.message});
  }
})

app.get('/getProducts', async (req, res) => {
  try{
    var category_id = req.body.category_id;
    var productsList;
    if(category_id){
      var productsList = await client.query("SELECT * FROM \"Product\" WHERE category_id = $1",[req.body.category_id]);
    }else{
      var productsList = await client.query("SELECT * FROM \"Product\"");
    }
    res.status(200).send(productsList.rows);
  }catch(err){
    res.status(400).send({error: err.message});
  }
})

async function CheckKey(key) {
  var userId = await client.query("SELECT \"User\".id FROM \"Session\" " +
               " INNER JOIN \"User\" ON \"User\".id = \"Session\".user_id " + 
               " WHERE \"Session\".key = $1 AND \"Session\".creation_date + interval '10 minutes' >= now()",
               [key.toString()]);
  return userId;
}

app.post('/addToFavorite', async (req, res) => {
  try{
    var product_id = req.body.product_id;
    var keyT = req.body.session_key;  

    var options = {
      method: 'POST',
      uri: authUrl + '/checkSession',
      body: {
          key: keyT,
      },
      json: true
  };
  var userData = await rp(options);
  if(userData.error){
    throw new Error(userId.error);
  }
  await client.query("INSERT INTO \"Favorite\" (user_id, product_id) VALUES ($1, $2)", [userData.id, product_id]);
  res.status(200).send("Inserted");

  }catch(err){
    res.send(err.error);
  }
})


app.get('/getFavorites', async(req, res) => {
  try{
  var keyT = req.body.session_key;
  var options = {
    method: 'POST',
    uri: authUrl + '/checkSession',
    body: {
        key: keyT,
    },
    json: true
};
var userData = await rp(options);
if(userData.error){
  throw new Error(userId.error);
}
  
var listOfFavorites = await client.query("SELECT \"Product\".id, \"Product\".name" +
                                      " FROM \"Favorite\" "+
                                      " INNER JOIN \"Product\" ON \"Product\".id = \"Favorite\".product_id" +
                                      " INNER JOIN \"User\" ON \"User\".id = \"Favorite\".user_id "+
                                      " WHERE \"User\".id = $1",[userData.id]);

  res.status(200).send(listOfFavorites.rows);
  }catch(err){
    res.status(400).send(err.message);
  }
})

app.listen(config.server.port, function () {
    console.log('Server is running.. on Port '+ config.server.port);
});
