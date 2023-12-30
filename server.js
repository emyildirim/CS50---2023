require('dotenv').config();
const express = require("express");
const app = express();
const HTTP_PORT = process.env.PORT || 8080;

// setup sessions
const session = require('express-session')
app.use(session({
   secret: "the quick brown fox jumped over the lazy dog 1234567890",  // random string, used for configuring the session
   resave: false,
   saveUninitialized: true
}))

// configure a folder for external css stylesheets and images
app.use(express.static("assets"))

// req.body
app.use(express.urlencoded({ extended: false }));

// ejs
app.set("view engine", "ejs");

// enable server to receive data as JSON
app.use(express.json());

/// --------------
// DATABASE : Connecting to database and setting up your schemas/models (tables)
/// --------------

const mongoose = require("mongoose")

mongoose.connect(process.env.MONGODB_URI);

const db = mongoose.connection;
db.on("error", console.error.bind(console, "Error connecting to database: "));
db.once("open", () => { console.log("Mongo DB connected successfully."); });


// define the schemas and models

// schemas
const Schema = mongoose.Schema
const BooksSchema = new Schema({ title: String, author: String, imageOfBook: String, borrowedBy: String })
const UsersSchema = new Schema({ name: String, libCardNum: String, isAdmin: Boolean })
const HistorySchema = new Schema({ bookId: String, libCard: String, title: String, author: String, dateBorrow: Date, dateReturn: Date })

// models - create collection if not exist and select it
const Book = mongoose.model("books", BooksSchema)
const User = mongoose.model("users", UsersSchema)
const History = mongoose.model("history", HistorySchema)

///////////////////
// COLLECTIONS IN THE MONGODB Database
//////////////////

// BOOKS
/*
  [
    { "title": "Harry Potter and the Chamber of Secrets", "author": "J. K. Rowling", "imageOfBook": "http://bit.ly/47O2Q1i", "borrowedBy": "" },
    { "title": "Nineteen Eighty-Four", "author": "George Orwell", "imageOfBook": "https://bit.ly/46t6psH", "borrowedBy": "" },
    { "title": "Dracula", "author": "Bram Stoker", "imageOfBook": "https://bit.ly/3GjWafz", "borrowedBy": "" },
    { "title": "The Lord of the Rings", "author": "J. R. R. Tolkien", "imageOfBook": "https://bit.ly/3Rc9gSl", "borrowedBy": "" },
    { "title": "The Handmaid's Tale", "author": "Margaret Atwood", "imageOfBook": "https://bit.ly/47Iug8U", "borrowedBy": "" },
    { "title": "The Lord of the Rings", "author": "J. R. R. Tolkien", "imageOfBook": "https://bit.ly/3Rc9gSl", "borrowedBy": "" },
  ]
*/

//TODO: change the user names

// USERS
/*
  [
    { "name": "Abbie Lee", "libCardNum": "0001", "isAdmin": false },
    { "name": "David Aziz", "libCardNum": "0002", "isAdmin": false },
    { "name": "Michael Shark", "libCardNum": "0000", "isAdmin": true }
  ]
*/

// ----------------------------------------------
// Endpoints
// ----------------------------------------------

//anyone can see the home page but functionality is limited without login
app.get("/", async (req, res) => {

  try {

    //get all the users from the database
    const results = await Book.find().lean().exec()
    
    //check if the user has logged in
    if (req.session.hasOwnProperty("userData") === true) {

      return res.render("home", { userData: req.session.userData, bookList: results });
    } else {
      return res.render("home", { userData: "", bookList: results });
    }
  } catch (err) {
    console.log(err)
  }
});


// anyone can see the login page
app.get("/login", (req, res) => {
  return res.render("login", { userData: "" })
});


app.post("/login", async (req, res) => {
  const libCardFromUI = req.body.libCard
  const passwordFromUI = req.body.password

  let correctCredentials = false
  try {
    //get the users from the database
    const userList = await User.find().lean().exec()

    // search the LIST for a matching libCardNum
    for (let currUser of userList) {
      if (libCardFromUI === currUser.libCardNum) {
        // if found, then check that password matches
        //NOTE: The password is always the user’s lib card num + the first letter of their name.
        if (passwordFromUI === (currUser.libCardNum + currUser.name[0])) {

          correctCredentials = true;
          req.session.userData = { username: currUser.name, libCardNum: libCardFromUI, isAdmin: currUser.isAdmin}
          break;
        }
      }
    }
  } catch (err) {
    console.log(err)
  }

  if (correctCredentials === true) {
    // send user back to home page
    res.redirect("/")
  } else {
    return res.send("Sorry, invalid username/password")
  }
});


// only users can see the book history page
app.get("/history", async (req, res) => {
  //check if the user has logged in
  if (req.session.hasOwnProperty("userData") === true) {

    //get user info from session var
    const libCardFromSession = req.session.userData.libCardNum
    try {
      //get the books from the database
      const bookList = await History.find({ libCard: libCardFromSession }).find().lean().exec()
      return res.render("history", { userData: req.session.userData, bookList: bookList})
    } catch (err) {
      console.log(err)
    }
  } else {
    return res.redirect("/")
  }
});


// only users can see the reset option in history
app.post("/history/reset", async (req, res) => {
  
  //check if the user has logged in
  if (req.session.hasOwnProperty("userData") === true) {

    //get user info from session var
    const libCardFromSession = req.session.userData.libCardNum

    try {

      //get all the books from the history which belongs to the user
      const bookList = await History.find({ libCard: libCardFromSession, dateReturn: null })

      //if there is any book hasn't returned
      if(bookList.length === 0){
        //reset the history of the user
        await History.deleteMany({ libCard: libCardFromSession })
      }else
      return res.redirect("/history")
       
    } catch (err) {
      console.log(err)
    }
  } else
    return res.redirect("/")
});


// everyone can see borrow option but only logged in users can use it
app.post("/borrow/:bookId", async (req, res) => {

  //check if the user has logged in
  if (req.session.hasOwnProperty("userData") === true) {

    //get user info from session var
    const libCardNumFromSession = req.session.userData.libCardNum

    try {
      //get the book from the database
      const book = await Book.findOne({ _id: req.params.bookId })
     
        //if the book found and 
      if (book !== null) {
          //if book did not borrow by someone
        if (book.borrowedBy === "") {

          //update the borrowedBy at database
            await Book.updateOne({ _id: book._id }, { $set: { borrowedBy: libCardNumFromSession } })
            
            //create a history document about the book borrowed
            await History.create({ bookId: book._id, libCard: libCardNumFromSession, title: book.title, author: book.author, dateBorrow: new Date(), dateReturn: null })
          }
        }

      
      return res.redirect("/")

    } catch (err) {
      console.log(err)
    }
  } else {
    return res.redirect("/login")
  }
});


// only logged in users can see and use return option
app.post("/return/:bookId", async (req, res) => {

  //check if the user has logged in
  if (req.session.hasOwnProperty("userData") === true) {

    try {
      //get the book from the database
      const bookFromHistory = await History.findOne({ bookId: req.params.bookId, dateReturn: null })
      
      //if the book found and did not borrow by someone
      if (bookFromHistory !== null) {

        //update the borrowedBy at database
        await Book.updateOne({ _id: bookFromHistory.bookId }, { $set: { borrowedBy: "" } })
        

        //update the history document about the book borrowed
        await History.updateOne(
          { bookId: bookFromHistory.bookId, dateBorrow: bookFromHistory.dateBorrow },
          { $set: { dateReturn: new Date() } }
        )
      }

      return res.redirect("/history")

    } catch (err) {
      console.log(err)
    }
  }
  return res.redirect("/")
});


// only logged in admins can see it
app.get("/admin/users", async (req, res) => {

  //check if the user has logged in and the user is an admin
  if (req.session.hasOwnProperty("userData") === true && req.session.userData.isAdmin) {

    try {
      //get all the users from the database
      const allUsers = await User.find().lean().exec()
      
      //get the num of books borrowed for each user
      const numOfBooksPerUser = await History.aggregate([
        {
          $match: {
            dateReturn: null
          }
        },
        {
          $group: {
            _id: "$libCard",
            numOfBooks: { $sum: 1 }
          }
        }
      ]);

      //for saving the merged info into a new list
      let userList = []
      let isBorrowedAny = false

      //merge the num of books and the users
      for(let currUser of allUsers){

        isBorrowedAny = false
        for(const currUser2 of numOfBooksPerUser){
          
          //if the user has borrowed any book
          if (currUser.libCardNum === currUser2._id){
            userList.push({
              libCardNum: currUser.libCardNum,
              name: currUser.name,
              isAdmin: currUser.isAdmin,
              numOfBooks: currUser2.numOfBooks
            })
            isBorrowedAny = true
            break;
          }
        }
        if (!isBorrowedAny) {
          userList.push({
            libCardNum: currUser.libCardNum,
            name: currUser.name,
            isAdmin: currUser.isAdmin,
            numOfBooks: 0
          })
        }
      }

      return res.render("adminpanel", { userData: req.session.userData, userList: userList })

    } catch (err) {
      console.log(err)
    }
  }
  return res.redirect("/")
});


// only logged in users can see and use logout option
app.get("/logout", (req, res) => {

  //reset the req.session
  req.session.destroy()

  // optional: redirect them back to the home page
  return res.redirect("/")
});

const onServerStart = () => {
  console.log("Express http server listening on: " + HTTP_PORT);
  console.log(`http://localhost:${HTTP_PORT}`);
};
app.listen(HTTP_PORT, onServerStart);