const cleanTitle = (title) => {
  console.log("now trimming: ",title)
    return title.trim().replace(/\s+/g, ' ');
  };
  export default cleanTitle;